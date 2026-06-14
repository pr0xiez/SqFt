import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  type InvoiceStatusFilter,
  OPEN_INVOICE_STATUSES,
} from "@/components/invoices/filterInvoices";
import { InvoiceLockedError, InvoiceOverbillError } from "@/lib/api/errors";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { computeEstimateBilling } from "@/lib/invoices/compute";
import { isOverbill } from "@/lib/invoices/createInvoiceForm";
import type { InvoiceLike, ProrationSource } from "@/lib/invoices/types";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import { searchableInt } from "@/lib/repositories/search";
import type { SortDirection } from "@/lib/sort";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Hydrated estimate shape the proration source needs (matches fromPrismaEstimate input). */
type HydratedEstimate = Parameters<typeof fromPrismaEstimate>[0];

/** Build the ProrationSource (estimate view + per-line metadata) from a hydrated estimate. */
export function buildInvoiceProrationSource(
  estimate: HydratedEstimate & {
    lineItems: Array<{ id: number; name: string; description: string | null }>;
  }
): ProrationSource {
  const view = computeEstimateView(fromPrismaEstimate(estimate));
  return {
    view,
    lineMeta: estimate.lineItems.map((li) => ({
      id: li.id,
      name: li.name,
      description: li.description ?? null,
    })),
  };
}

/** Resolve the billed dollar amount + stored pct from the create/patch input. */
export function computeInvoiceAmount(args: {
  estimateTotal: number;
  amount?: number;
  pct?: number;
}): { amount: number; pct: number | null } {
  if (args.amount !== undefined)
    return { amount: round2(args.amount), pct: null };
  const pct = args.pct ?? 0;
  return { amount: round2(args.estimateTotal * pct), pct };
}

const INVOICE_INCLUDE = {
  payments: { orderBy: { paidAt: "asc" } },
  invoiceEvents: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.InvoiceInclude;

/** Detail include also pulls the customer email so the send form can prefill it. */
const INVOICE_DETAIL_INCLUDE = {
  ...INVOICE_INCLUDE,
  estimate: {
    select: {
      siteMeasure: {
        select: {
          location: { select: { customer: { select: { email: true } } } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: typeof INVOICE_INCLUDE;
}>;

/** A single invoice plus the customer email derived from its estimate chain. */
export type InvoiceDetailRecord = InvoiceWithDetails & {
  customerEmail: string | null;
};

/** Sum recorded payments → InvoiceLike for billing math. */
function toInvoiceLike(inv: {
  amount: number;
  status: string;
  payments: { amount: number }[];
}): InvoiceLike {
  return {
    amount: inv.amount,
    status: inv.status,
    paidAmount: inv.payments.reduce((s, p) => s + p.amount, 0),
  };
}

export async function listInvoicesForEstimate(
  estimateId: number,
  orgId: string
) {
  return prisma.invoice.findMany({
    where: { orgId, estimateId },
    orderBy: { createdAt: "asc" },
    include: INVOICE_INCLUDE,
  });
}

export async function getInvoice(
  id: number,
  orgId: string
): Promise<InvoiceDetailRecord | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, orgId },
    include: INVOICE_DETAIL_INCLUDE,
  });
  if (!invoice) return null;
  const { estimate, ...rest } = invoice;
  return {
    ...rest,
    customerEmail: estimate.siteMeasure.location.customer.email,
  };
}

export interface CreateInvoiceInput {
  estimateId: number;
  amount?: number;
  pct?: number;
  memo?: string;
  terms?: string;
  coverNote?: string;
  dueDate?: string;
}

export async function createInvoice(orgId: string, input: CreateInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: { id: input.estimateId, orgId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        siteMeasure: { select: { items: { orderBy: { sortOrder: "asc" } } } },
        invoices: {
          select: {
            amount: true,
            status: true,
            payments: { select: { amount: true } },
          },
        },
      },
    });
    if (!estimate) return null;

    const view = computeEstimateView(fromPrismaEstimate(estimate));
    const estimateTotal = view.total;

    const { amount, pct } = computeInvoiceAmount({
      estimateTotal,
      amount: input.amount,
      pct: input.pct,
    });

    const billing = computeEstimateBilling(
      estimateTotal,
      estimate.invoices.map(toInvoiceLike)
    );
    if (isOverbill(amount, billing.unbilled)) {
      throw new InvoiceOverbillError(billing.unbilled);
    }

    // Atomically reserve the next number. The increment-returning update locks
    // the Organization row, so concurrent creates can't allocate the same
    // number (a plain read does not lock under READ COMMITTED).
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, defaultPaymentInstructions: true },
    });
    const invoiceNumber = org.nextInvoiceNumber - 1;

    return tx.invoice.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        invoiceNumber,
        status: "draft",
        amount,
        pct,
        memo: input.memo ?? null,
        terms: input.terms ?? estimate.terms,
        coverNote: input.coverNote ?? "",
        paymentInstructions: org.defaultPaymentInstructions,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: INVOICE_INCLUDE,
    });
  });
}

/** Derive the lifecycle status from the payment ledger. Void is terminal. */
export function nextInvoiceStatus(args: {
  current: string;
  amount: number;
  paid: number;
}): string {
  if (args.current === "void") return "void";
  if (args.paid <= 0) {
    return args.current === "draft"
      ? "draft"
      : args.current === "viewed"
        ? "viewed"
        : "sent";
  }
  if (args.paid + 0.005 >= args.amount) return "paid";
  return "partial";
}

export interface UpdateInvoiceInput {
  amount?: number;
  pct?: number;
  memo?: string | null;
  terms?: string;
  coverNote?: string;
  paymentInstructions?: string;
  dueDate?: string | null;
}

/** Edit a DRAFT invoice. Throws InvoiceLockedError once sent. */
export async function updateInvoice(
  id: number,
  orgId: string,
  patch: UpdateInvoiceInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, orgId },
      include: {
        estimate: {
          include: {
            lineItems: { orderBy: { sortOrder: "asc" } },
            siteMeasure: {
              select: { items: { orderBy: { sortOrder: "asc" } } },
            },
            invoices: {
              select: {
                id: true,
                amount: true,
                status: true,
                payments: { select: { amount: true } },
              },
            },
          },
        },
      },
    });
    if (!existing) return null;
    if (existing.status !== "draft") throw new InvoiceLockedError();

    const data: Prisma.InvoiceUpdateInput = {};
    if (patch.memo !== undefined) data.memo = patch.memo;
    if (patch.terms !== undefined) data.terms = patch.terms;
    if (patch.coverNote !== undefined) data.coverNote = patch.coverNote;
    if (patch.paymentInstructions !== undefined)
      data.paymentInstructions = patch.paymentInstructions;
    if (patch.dueDate !== undefined) {
      data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
    }

    if (patch.amount !== undefined || patch.pct !== undefined) {
      const view = computeEstimateView(fromPrismaEstimate(existing.estimate));
      const { amount, pct } = computeInvoiceAmount({
        estimateTotal: view.total,
        amount: patch.amount,
        pct: patch.pct,
      });
      const others = existing.estimate.invoices
        .filter((i) => i.id !== id)
        .map(toInvoiceLike);
      const billing = computeEstimateBilling(view.total, others);
      if (isOverbill(amount, billing.unbilled)) {
        throw new InvoiceOverbillError(billing.unbilled);
      }
      data.amount = amount;
      data.pct = pct;
    }

    return tx.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
  });
}

export async function voidInvoice(id: number, orgId: string) {
  const res = await prisma.invoice.updateMany({
    where: { id, orgId, status: { not: "void" } },
    data: { status: "void", voidedAt: new Date() },
  });
  if (res.count === 0) return null;
  await prisma.invoiceEvent.create({
    data: { invoiceId: id, type: "voided", source: "builder" },
  });
  return getInvoice(id, orgId);
}

export async function rotateInvoiceToken(id: number, orgId: string) {
  const token = generateToken();
  const res = await prisma.invoice.updateMany({
    where: { id, orgId },
    data: { publicToken: token },
  });
  return res.count > 0 ? token : null;
}

export interface WriteInvoiceEventInput {
  invoiceId: number;
  type: "link_rotated";
  actorEmail?: string;
  actorName?: string;
}

/**
 * Append a lifecycle event that isn't already written atomically by its
 * mutation (markInvoiceSent / voidInvoice / recordPayment own their own
 * events inside their transactions). Callers must have already org-scoped
 * the invoice.
 */
export async function writeInvoiceEvent(
  input: WriteInvoiceEventInput
): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: input.invoiceId,
      type: input.type,
      source: "builder",
      actorEmail: input.actorEmail ?? null,
      actorName: input.actorName ?? null,
    },
  });
}

export interface MarkInvoiceSentInput {
  to: string;
  subject: string;
  sentByEmail: string;
  sentByName: string;
  snapshot: Prisma.InputJsonValue;
}

/** Stamp send metadata + freeze the snapshot + log sent/resent. */
export async function markInvoiceSent(
  id: number,
  orgId: string,
  input: MarkInvoiceSentInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, sentAt: true },
    });
    if (!existing) return false;

    await tx.invoice.update({
      where: { id },
      data: {
        status: existing.status === "draft" ? "sent" : existing.status,
        sentAt: new Date(),
        sentToEmail: input.to,
        sentByEmail: input.sentByEmail,
        sentByName: input.sentByName,
        snapshot: input.snapshot,
      },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId: id,
        type: existing.sentAt ? "resent" : "sent",
        source: "builder",
        actorEmail: input.sentByEmail,
        actorName: input.sentByName,
        metadata: { to: input.to, subject: input.subject },
      },
    });
    return true;
  });
}

export interface MarkInvoiceViewedInput {
  ip: string | null;
  userAgent: string | null;
}

/** Public view-tracking. Flips sent → viewed; always logs the open. */
export async function markInvoiceViewed(
  invoiceId: number,
  input: MarkInvoiceViewedInput
) {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!inv) return;
    if (inv.status === "sent") {
      await tx.invoice.updateMany({
        where: { id: invoiceId, status: "sent" },
        data: { status: "viewed", viewedAt: new Date() },
      });
    }
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        type: "viewed",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  });
}

export interface RecordPaymentInput {
  amount: number;
  method: string;
  paidAt?: string;
  reference?: string;
  note?: string;
  recordedByEmail: string;
  recordedByName: string;
}

/** Append a Payment, recompute status + paidAt, log payment_recorded. */
export async function recordPayment(
  invoiceId: number,
  orgId: string,
  input: RecordPaymentInput
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { payments: { select: { amount: true } } },
    });
    if (!inv) return null;
    if (inv.status === "void") throw new InvoiceLockedError();

    await tx.payment.create({
      data: {
        invoiceId,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        reference: input.reference ?? null,
        note: input.note ?? null,
        recordedByEmail: input.recordedByEmail,
        recordedByName: input.recordedByName,
      },
    });

    const paid = inv.payments.reduce((s, p) => s + p.amount, 0) + input.amount;
    const status = nextInvoiceStatus({
      current: inv.status,
      amount: inv.amount,
      paid,
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status, paidAt: status === "paid" ? new Date() : null },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        type: "payment_recorded",
        source: "builder",
        actorEmail: input.recordedByEmail,
        actorName: input.recordedByName,
        metadata: { amount: input.amount, method: input.method },
      },
    });

    return tx.invoice.findFirst({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE,
    });
  });
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

export interface RecordStripePaymentInput {
  amount: number;
  method: "card" | "ach";
  stripeChargeId: string;
  stripePaymentIntentId: string;
  paidAt?: Date;
  stripeEventId?: string;
}

/**
 * Record a SETTLED Stripe payment into the ledger — the no-human counterpart
 * to recordPayment. Idempotent on Payment.stripeChargeId (find-first → skip,
 * with a P2002 catch as the hard backstop). Writes recordedByEmail:null /
 * recordedByName:'Stripe'. Reuses nextInvoiceStatus unchanged (we only ever
 * write rows for settled money, so an in-flight ACH never reaches here).
 */
export async function recordStripePayment(
  invoiceId: number,
  orgId: string,
  input: RecordStripePaymentInput
): Promise<"recorded" | "duplicate" | "not_found"> {
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.payment.findUnique({
      where: { stripeChargeId: input.stripeChargeId },
      select: { id: true },
    });
    if (dupe) return "duplicate";

    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { payments: { select: { amount: true } } },
    });
    if (!inv) return "not_found";
    if (inv.status === "void") return "duplicate";

    try {
      await tx.payment.create({
        data: {
          invoiceId,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt ?? new Date(),
          recordedByEmail: null,
          recordedByName: "Stripe",
          stripeChargeId: input.stripeChargeId,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return "duplicate";
      throw e;
    }

    const paid = inv.payments.reduce((s, p) => s + p.amount, 0) + input.amount;
    const status = nextInvoiceStatus({
      current: inv.status,
      amount: inv.amount,
      paid,
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        paidAt: status === "paid" ? new Date() : null,
        stripePaymentIntentId: input.stripePaymentIntentId,
      },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        type: "payment_recorded",
        source: "system",
        metadata: {
          amount: input.amount,
          method: input.method,
          stripeChargeId: input.stripeChargeId,
          stripePaymentIntentId: input.stripePaymentIntentId,
          stripeEventId: input.stripeEventId ?? null,
        },
      },
    });
    return "recorded";
  });
}

/** Resolve the org + connected-account for a webhook PaymentIntent's invoice. */
export async function getStripeInvoiceContext(
  metadataInvoiceId: number
): Promise<{
  invoiceId: number;
  orgId: string;
  orgConnectAccountId: string | null;
} | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: metadataInvoiceId },
    select: {
      id: true,
      orgId: true,
      org: { select: { stripeConnectAccountId: true } },
    },
  });
  if (!inv) return null;
  return {
    invoiceId: inv.id,
    orgId: inv.orgId,
    orgConnectAccountId: inv.org.stripeConnectAccountId,
  };
}

/** Append a non-transactional invoice event (used by the webhook for markers). */
export async function appendInvoiceEvent(input: {
  invoiceId: number;
  type: string;
  source: "customer" | "system" | "builder";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: input.invoiceId,
      type: input.type,
      source: input.source,
      // Cast at the Prisma boundary: the handler-facing type is a plain record;
      // the column is JSON. Keeps the StripeWebhookDeps interface SDK-free.
      metadata: (input.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    },
  });
}

/** Public token lookup (no org scope — the token authorizes). */
export async function getInvoiceByToken(token: string) {
  return prisma.invoice.findUnique({
    where: { publicToken: token },
    include: INVOICE_INCLUDE,
  });
}

/** Hydrate an invoice with everything the send route needs to build a snapshot. */
export async function getInvoiceForSend(id: number, orgId: string) {
  return prisma.invoice.findFirst({
    where: { id, orgId },
    include: {
      estimate: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          siteMeasure: {
            include: {
              items: { orderBy: { sortOrder: "asc" } },
              location: { include: { customer: true } },
            },
          },
        },
      },
      org: {
        select: {
          name: true,
          phone: true,
          address: true,
          licenseNumber: true,
          logo: true,
        },
      },
    },
  });
}

export type InvoiceSortKey =
  | "number"
  | "customer"
  | "amount"
  | "dueDate"
  | "sentAt";

export interface ListInvoicesParams {
  page: number;
  perPage: number;
  sort: { key: InvoiceSortKey; direction: SortDirection };
  q: string;
  status: InvoiceStatusFilter;
}

/** Flat row shape for the org-wide invoices list. */
export interface InvoiceListRow {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  balanceDue: number;
  dueDate: Date | null;
  sentAt: Date | null;
  estimateId: number;
  customerName: string | null;
}

const INVOICE_LIST_INCLUDE = {
  payments: { select: { amount: true } },
  estimate: {
    select: {
      siteMeasure: {
        select: {
          location: { select: { customer: { select: { name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

function invoiceOrderBy(
  sort: ListInvoicesParams["sort"]
): Prisma.InvoiceOrderByWithRelationInput {
  const dir = sort.direction;
  switch (sort.key) {
    case "number":
      return { invoiceNumber: dir };
    case "customer":
      return {
        estimate: { siteMeasure: { location: { customer: { name: dir } } } },
      };
    case "amount":
      return { amount: dir };
    case "dueDate":
      return { dueDate: { sort: dir, nulls: "last" } };
    default:
      return { sentAt: { sort: dir, nulls: "last" } };
  }
}

function invoiceSearchWhere(q: string): Prisma.InvoiceWhereInput | null {
  const cleaned = q.trim().replace(/^#/, "");
  if (cleaned.length === 0) return null;
  const or: Prisma.InvoiceWhereInput[] = [
    {
      estimate: {
        siteMeasure: {
          location: {
            customer: { name: { contains: cleaned, mode: "insensitive" } },
          },
        },
      },
    },
  ];
  const n = searchableInt(cleaned);
  if (n !== null) or.push({ invoiceNumber: n });
  return { OR: or };
}

export async function listInvoices(
  orgId: string,
  params: ListInvoicesParams
): Promise<Paginated<InvoiceListRow>> {
  const where: Prisma.InvoiceWhereInput = { orgId };
  if (params.status === "open") {
    where.status = { in: [...OPEN_INVOICE_STATUSES] };
  } else if (params.status !== "all") {
    where.status = params.status;
  }
  const search = invoiceSearchWhere(params.q);
  if (search) Object.assign(where, search);

  const [rows, total, grouped] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: invoiceOrderBy(params.sort),
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: INVOICE_LIST_INCLUDE,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { _all: true },
      orderBy: undefined,
    }),
  ]);

  const facets: Record<string, number> = {
    all: 0,
    open: 0,
    draft: 0,
    sent: 0,
    viewed: 0,
    partial: 0,
    paid: 0,
    void: 0,
  };
  for (const row of grouped) {
    const count = row._count;
    const n = typeof count === "object" ? (count._all ?? 0) : 0;
    facets.all += n;
    if (row.status in facets) facets[row.status] = n;
    if ((OPEN_INVOICE_STATUSES as readonly string[]).includes(row.status)) {
      facets.open += n;
    }
  }

  const items = rows.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    balanceDue: round2(
      inv.amount - inv.payments.reduce((s, p) => s + p.amount, 0)
    ),
    dueDate: inv.dueDate,
    sentAt: inv.sentAt,
    estimateId: inv.estimateId,
    customerName: inv.estimate.siteMeasure.location?.customer?.name ?? null,
  }));

  return { items, total, facets };
}
