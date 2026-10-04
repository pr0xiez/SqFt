import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  InvoiceLockedError,
  InvoiceOverbillError,
  InvoiceOverpayError,
} from "@/lib/api/errors";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import {
  computeEstimateBilling,
  invoiceOutstanding,
  isOverbill,
  OVERBILL_EPSILON,
  paymentsPaidTotal,
} from "@/lib/invoices/compute";
import {
  type InvoiceStatusFilter,
  OPEN_INVOICE_STATUSES,
} from "@/lib/invoices/statusFilter";
import type { InvoiceLike, ProrationSource } from "@/lib/invoices/types";
import { logError } from "@/lib/logger";
import { round2 } from "@/lib/money";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import { enqueueQboTaskTx } from "@/lib/repositories/qboRepo";
import { buildSearchWhere, computeFacets } from "@/lib/repositories/search";
import type { SortDirection } from "@/lib/sort";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
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

/** Scalar fields of Invoice returned by every authenticated read/write below
 *  — every column EXCEPT `publicToken`. `publicToken` is a live bearer
 *  credential for the unauthenticated `/invoice-review/[token]` payment flow;
 *  it must never ride along in a payload an authenticated API route hands
 *  back to the browser. The only sanctioned read of it is
 *  `rotateInvoiceToken` (returns a freshly-minted token to the lead who
 *  explicitly requested one, via the `/api/invoices/[id]/public-token`
 *  route). See CONTEXT.md "Public tokens". */
const INVOICE_SCALAR_SELECT = {
  id: true,
  orgId: true,
  estimateId: true,
  invoiceNumber: true,
  status: true,
  amount: true,
  pct: true,
  memo: true,
  coverNote: true,
  terms: true,
  paymentInstructions: true,
  date: true,
  dueDate: true,
  sentAt: true,
  sentToEmail: true,
  sentByEmail: true,
  sentByName: true,
  viewedAt: true,
  paidAt: true,
  voidedAt: true,
  stripePaymentLinkUrl: true,
  stripePaymentIntentId: true,
  snapshot: true,
  createdAt: true,
} satisfies Prisma.InvoiceSelect;

/** Deliberately a `select`, not an `include` — see {@link INVOICE_SCALAR_SELECT}. */
const INVOICE_SELECT = {
  ...INVOICE_SCALAR_SELECT,
  payments: { orderBy: { paidAt: "asc" } },
  invoiceEvents: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.InvoiceSelect;

/** Detail select also walks up the record chain: the customer email so the
 *  send form can prefill it, and the parent records for the page's trail. */
const INVOICE_DETAIL_SELECT = {
  ...INVOICE_SELECT,
  estimate: {
    select: {
      id: true,
      estimateNumber: true,
      siteMeasure: {
        select: {
          id: true,
          siteMeasureNumber: true,
          location: {
            select: {
              address: true,
              customer: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.InvoiceSelect;

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  select: typeof INVOICE_SELECT;
}>;

/** The parent records an invoice hangs off, for the detail page's trail. */
export interface InvoiceTrail {
  customer: { id: number; name: string };
  siteMeasure: { id: number; siteMeasureNumber: number | null };
  estimate: { id: number; estimateNumber: number };
  address: string;
}

/** A single invoice plus the customer email and parent records derived from
 *  its estimate chain. */
export type InvoiceDetailRecord = InvoiceWithDetails & {
  customerEmail: string | null;
  trail: InvoiceTrail;
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
    paidAmount: paymentsPaidTotal(inv.payments),
  };
}

export async function listInvoicesForEstimate(
  estimateId: number,
  orgId: string
) {
  return prisma.invoice.findMany({
    where: { orgId, estimateId },
    orderBy: { createdAt: "asc" },
    select: INVOICE_SELECT,
  });
}

export async function getInvoice(
  id: number,
  orgId: string
): Promise<InvoiceDetailRecord | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, orgId },
    select: INVOICE_DETAIL_SELECT,
  });
  if (!invoice) return null;
  const { estimate, ...rest } = invoice;
  const { siteMeasure } = estimate;
  const { customer } = siteMeasure.location;
  return {
    ...rest,
    customerEmail: customer.email,
    trail: {
      customer: { id: customer.id, name: customer.name },
      siteMeasure: {
        id: siteMeasure.id,
        siteMeasureNumber: siteMeasure.siteMeasureNumber,
      },
      estimate: { id: estimate.id, estimateNumber: estimate.estimateNumber },
      address: siteMeasure.location.address,
    },
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
    // Lock the Estimate row before reading it (and its invoices) so the
    // overbill decision below is serialized across concurrent creates for the
    // same estimate — a plain read does not lock under READ COMMITTED, so two
    // concurrent requests could both read the same stale `unbilled` balance,
    // both pass the check, and both commit past the estimate total (issue
    // #298). This mirrors the nextInvoiceNumber lock further down, just
    // applied to the estimate row instead of the org row.
    await tx.$queryRaw`SELECT id FROM "Estimate" WHERE id = ${input.estimateId} AND "orgId" = ${orgId} FOR UPDATE`;

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
      select: INVOICE_SELECT,
    });
  });
}

/**
 * Derive the lifecycle status from the payment ledger. Void is terminal.
 *
 * When nothing is currently owed, "was this ever viewed by the customer" is
 * read from the persisted `viewedAt` timestamp rather than the transient
 * `current` status string. That matters because `current` can be `partial`
 * on the way in (a payment was recorded after the customer opened the
 * invoice) — keying off `current` alone would map a `partial` invoice whose
 * payment(s) later net back to zero (a reversal/refund) to `sent`, losing
 * the fact that it was already viewed. Deriving from `viewedAt` instead
 * means that fact survives regardless of which status the payment ledger
 * passed through on the way to zero.
 */
export function nextInvoiceStatus(args: {
  current: string;
  amount: number;
  paid: number;
  viewedAt?: Date | null;
}): string {
  if (args.current === "void") return "void";
  if (args.paid <= 0) {
    return args.current === "draft"
      ? "draft"
      : args.viewedAt
        ? "viewed"
        : "sent";
  }
  if (args.paid + OVERBILL_EPSILON >= args.amount) return "paid";
  return "partial";
}

export interface StripeChargeClassification {
  nextStatus: string;
  paidAfter: number;
  orphaned: boolean;
  overpaid: boolean;
}

/**
 * Decide how an incoming Stripe charge maps onto the invoice ledger — pure, no
 * IO. A captured charge is real money, so the recorder must NEVER silently drop
 * it; instead we surface the anomalies so the contractor can refund:
 *   - `orphaned`: the invoice was voided after the Checkout session opened, so
 *     the card was charged against a cancelled invoice.
 *   - `overpaid`: the total recorded now exceeds the invoice amount (e.g. a
 *     manual payment already covered the balance, then a stale session paid).
 * `nextStatus` delegates to nextInvoiceStatus, which keeps `void` terminal — a
 * charge never resurrects a voided invoice.
 */
export function classifyStripeCharge(args: {
  status: string;
  amount: number;
  priorPaid: number;
  chargeAmount: number;
  viewedAt?: Date | null;
}): StripeChargeClassification {
  const paidAfter = round2(args.priorPaid + args.chargeAmount);
  const nextStatus = nextInvoiceStatus({
    current: args.status,
    amount: args.amount,
    paid: paidAfter,
    viewedAt: args.viewedAt,
  });
  return {
    nextStatus,
    paidAfter,
    orphaned: args.status === "void",
    overpaid: paidAfter > args.amount + OVERBILL_EPSILON,
  };
}

export async function voidInvoice(id: number, orgId: string) {
  const res = await prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.updateMany({
      where: { id, orgId, status: { not: "void" } },
      data: { status: "void", voidedAt: new Date() },
    });
    if (updated.count === 0) return updated;
    await tx.invoiceEvent.create({
      data: { invoiceId: id, type: "voided", source: "builder" },
    });
    if (updated.count > 0)
      await enqueueQboTaskTx(tx, orgId, "void_invoice", id);
    return updated;
  });
  if (res.count === 0) return null;
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

/**
 * Read the invoice's existing public review token, minting one only if it
 * doesn't already have one — mirrors the send pipeline's `currentToken` /
 * `rotateToken` reuse semantics (`lib/send/pipeline.ts`). Backs the "copy
 * public link" UI action: repeated clicks must return the same link rather
 * than invalidating one already shared with the customer.
 */
export async function getOrCreateInvoicePublicToken(
  id: number,
  orgId: string
): Promise<string | null> {
  const row = await prisma.invoice.findFirst({
    where: { id, orgId },
    select: { publicToken: true },
  });
  if (!row) return null;
  return row.publicToken ?? rotateInvoiceToken(id, orgId);
}

/**
 * Whether the invoice currently has a live public review token — collapsed
 * to a boolean before it ever leaves the server, so the "copy public link"
 * UI affordance doesn't require exposing `publicToken` itself. Returns false
 * for an invoice outside the org (matches the null-object pattern other
 * reads use rather than throwing).
 */
export async function invoiceHasPublicToken(
  id: number,
  orgId: string
): Promise<boolean> {
  const row = await prisma.invoice.findFirst({
    where: { id, orgId },
    select: { publicToken: true },
  });
  return Boolean(row?.publicToken);
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
    await enqueueQboTaskTx(tx, orgId, "sync_invoice", id);
    // Payments recorded before the first send had no frozen invoice to
    // mirror. Re-arm them now that its snapshot exists.
    const payments = await tx.payment.findMany({
      where: { invoiceId: id, invoice: { orgId } },
      select: { id: true },
    });
    for (const payment of payments)
      await enqueueQboTaskTx(tx, orgId, "sync_payment", payment.id);
    return true;
  });
}

export interface MarkInvoiceViewedInput {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Public view-tracking. Flips sent → viewed; always logs the open.
 * Org-scoped like every other invoice mutation (issue #258) — the caller
 * (the public token page) already has the invoice row and its orgId, so no
 * extra query is needed to supply it.
 */
export async function markInvoiceViewed(
  invoiceId: number,
  orgId: string,
  input: MarkInvoiceViewedInput
) {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: { status: true },
    });
    if (!inv) return;
    if (inv.status === "sent") {
      await tx.invoice.updateMany({
        where: { id: invoiceId, orgId, status: "sent" },
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
    // Row-lock the invoice before reading its payments so a concurrent
    // recordPayment on the same invoice blocks here instead of both
    // transactions computing a status from the same stale `payments` sum
    // (lost update — issue #206). Postgres' default READ COMMITTED
    // isolation doesn't protect this on its own; an explicit
    // SELECT ... FOR UPDATE does.
    const locked = await tx.$queryRaw<
      { id: number }[]
    >`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "orgId" = ${orgId} FOR UPDATE`;
    if (locked.length === 0) return null;

    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { payments: { select: { amount: true } } },
    });
    if (!inv) return null;
    if (inv.status === "void") throw new InvoiceLockedError();

    const outstanding = invoiceOutstanding(inv);
    if (input.amount > outstanding + OVERBILL_EPSILON) {
      throw new InvoiceOverpayError(outstanding);
    }

    const payment = await tx.payment.create({
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
    await enqueueQboTaskTx(tx, orgId, "sync_payment", payment.id);

    const paid = paymentsPaidTotal(inv.payments) + input.amount;
    const status = nextInvoiceStatus({
      current: inv.status,
      amount: inv.amount,
      paid,
      viewedAt: inv.viewedAt,
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
      select: INVOICE_SELECT,
    });
  });
}

/**
 * Audit-trail a failed async (bank-debit) Stripe payment. No ledger row is
 * written — no money moved, and the unpaid-gated webhook never recorded the
 * session — so this only leaves a `payment_failed` event on the invoice.
 * Org-scoped: a forged invoiceId outside the account's org is a no-op.
 */
export async function recordStripePaymentFailure(input: {
  orgId: string;
  invoiceId: number;
  amount: number;
  paymentIntentId: string | null;
}): Promise<void> {
  const inv = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, orgId: input.orgId },
    select: { id: true },
  });
  if (!inv) return;
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: input.invoiceId,
      type: "payment_failed",
      source: "customer",
      actorName: "Stripe",
      metadata: {
        amount: input.amount,
        method: "stripe",
        ...(input.paymentIntentId
          ? { paymentIntentId: input.paymentIntentId }
          : {}),
      },
    },
  });
  logError({
    path: "lib/repositories/invoiceRepo#recordStripePaymentFailure",
    orgId: input.orgId,
    errorMessage: `Stripe bank payment failed on invoice ${input.invoiceId} (${input.amount})`,
  });
}

export interface RecordStripePaymentInput {
  paymentIntentId: string;
  chargeId: string;
  orgId: string;
  invoiceId: number;
  amount: number;
  feeAmount: number | null;
  netAmount: number | null;
}

/**
 * Fill in fee/net on an already-recorded Stripe payment. The first recorder
 * can beat Stripe's balance transaction (read-after-write lag) and store them
 * null; a later delivery of the same charge (webhook redelivery, the other
 * path) carries them. Only fills a null pair, so a captured fee/net is never
 * overwritten; org-scoped like every other write here.
 */
async function backfillStripeFees(
  input: RecordStripePaymentInput,
  db: Prisma.TransactionClient = prisma
): Promise<void> {
  if (input.feeAmount === null || input.netAmount === null) return;
  await db.payment.updateMany({
    where: {
      stripeChargeId: input.chargeId,
      stripeFeeAmount: null,
      stripeNetAmount: null,
      invoice: { orgId: input.orgId },
    },
    data: {
      stripeFeeAmount: input.feeAmount,
      stripeNetAmount: input.netAmount,
    },
  });
}

/**
 * Idempotent Stripe payment recorder. Returns `{ recorded: true }` on the
 * first successful write, `{ recorded: false }` if the chargeId is already
 * present (soft idempotency check) or if the invoice is missing. A racing
 * double-insert that slips past the soft check is caught via the `@unique`
 * constraint on `Payment.stripeChargeId` (P2002 → `recorded: false`). Either
 * duplicate path backfills fee/net the existing row lacks
 * (`backfillStripeFees`), so they end up captured whichever delivery wins.
 *
 * A charge on a voided or already-covered invoice is still recorded (the money
 * is real) but flagged via `classifyStripeCharge` — an `InvoiceEvent` with
 * `refundNeeded` and a `logError` — rather than silently dropped. A charge
 * never resurrects a voided invoice.
 */
export async function recordStripePayment(
  input: RecordStripePaymentInput
): Promise<{ recorded: boolean; overpaid: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Soft idempotency check: a payment with this chargeId already exists.
      const existing = await tx.payment.findUnique({
        where: { stripeChargeId: input.chargeId },
        select: { id: true },
      });
      if (existing) {
        await backfillStripeFees(input, tx);
        return { recorded: false, overpaid: false };
      }

      const inv = await tx.invoice.findFirst({
        where: { id: input.invoiceId, orgId: input.orgId },
        include: { payments: { select: { amount: true } } },
      });
      if (!inv) return { recorded: false, overpaid: false };

      // A captured charge is real money. Record it even when the invoice was
      // voided or already covered — dropping it would leave an untracked charge
      // with no ledger row and no signal to refund. Surface the anomaly instead.
      const priorPaid = paymentsPaidTotal(inv.payments);
      const cls = classifyStripeCharge({
        status: inv.status,
        amount: inv.amount,
        priorPaid,
        chargeAmount: input.amount,
        viewedAt: inv.viewedAt,
      });
      const refundReason = cls.orphaned
        ? "invoice_void"
        : cls.overpaid
          ? "overpayment"
          : null;

      const payment = await tx.payment.create({
        data: {
          invoiceId: input.invoiceId,
          amount: input.amount,
          method: "stripe",
          stripeChargeId: input.chargeId,
          stripeFeeAmount: input.feeAmount,
          stripeNetAmount: input.netAmount,
          recordedByName: "Stripe",
        },
      });
      // Mirror the money into QBO too (the engine skips void invoices, so
      // the orphaned/refund-needed anomaly path stays SqFt-only).
      await enqueueQboTaskTx(tx, input.orgId, "sync_payment", payment.id);

      await tx.invoice.update({
        where: { id: input.invoiceId },
        data: {
          status: cls.nextStatus,
          paidAt: cls.nextStatus === "paid" ? new Date() : null,
          stripePaymentIntentId: input.paymentIntentId,
        },
      });
      await tx.invoiceEvent.create({
        data: {
          invoiceId: input.invoiceId,
          type: "payment_recorded",
          source: "customer",
          actorName: "Stripe",
          metadata: {
            amount: input.amount,
            method: "stripe",
            fee: input.feeAmount,
            net: input.netAmount,
            ...(refundReason ? { refundNeeded: true, refundReason } : {}),
          },
        },
      });
      if (refundReason) {
        logError({
          path: "lib/repositories/invoiceRepo#recordStripePayment",
          orgId: input.orgId,
          errorMessage: `Stripe charge ${input.chargeId} needs refund (${refundReason}): invoice ${input.invoiceId} now paid ${cls.paidAfter} of ${inv.amount}`,
        });
      }
      return { recorded: true, overpaid: cls.overpaid };
    });
  } catch (err) {
    // Hard idempotency backstop: two deliveries raced past the findUnique check
    // and the second lost the @unique constraint on stripeChargeId → P2002.
    // The winner (now committed) may lack the fee/net this delivery carries.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002"
    ) {
      await backfillStripeFees(input);
      return { recorded: false, overpaid: false };
    }
    throw err;
  }
}

export type StripeAnomalyReason =
  | "unknown_account"
  | "missing_invoice_metadata";

/**
 * Record captured-but-unattributable Stripe money so a human can reconcile it.
 * The webhook reaches here when a paid event carries an unknown `event.account`
 * or missing/invalid `invoiceId` metadata: real money moved but there is no
 * invoice to book it against. Redelivery can't fix bad metadata, so the webhook
 * still 200s — but CONTEXT.md invariant 3 forbids dropping it silently, so we
 * persist a queryable row (keyed on the Stripe event id for idempotency) and log.
 */
export async function recordStripeAnomaly(input: {
  eventId: string;
  eventType: string;
  accountId: string | null;
  paymentIntentId: string | null;
  amount: number;
  reason: StripeAnomalyReason;
}): Promise<void> {
  await prisma.stripeAnomaly.upsert({
    where: { eventId: input.eventId },
    create: {
      eventId: input.eventId,
      eventType: input.eventType,
      accountId: input.accountId,
      paymentIntentId: input.paymentIntentId,
      amount: input.amount,
      reason: input.reason,
    },
    update: {},
  });
  logError({
    path: "lib/repositories/invoiceRepo#recordStripeAnomaly",
    errorMessage: `Unattributable Stripe payment (${input.reason}): event ${input.eventId}, account ${input.accountId ?? "?"}, pi ${input.paymentIntentId ?? "?"}, amount ${input.amount}`,
  });
}

/** Public token lookup (no org scope — the token authorizes). The caller
 *  already holds the token (it's in the URL), so the response doesn't need
 *  to carry `publicToken` back — same `INVOICE_SELECT` as the authenticated
 *  reads. */
export async function getInvoiceByToken(token: string) {
  return prisma.invoice.findUnique({
    where: { publicToken: token },
    select: INVOICE_SELECT,
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

const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "void",
] as const;

function invoiceSearchWhere(q: string): Prisma.InvoiceWhereInput | null {
  return buildSearchWhere<Prisma.InvoiceWhereInput>(q, {
    customerName: (cleaned) => ({
      estimate: {
        siteMeasure: {
          location: {
            customer: { name: { contains: cleaned, mode: "insensitive" } },
          },
        },
      },
    }),
    number: (n) => ({ invoiceNumber: n }),
  });
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

  const facets = computeFacets(grouped, INVOICE_STATUSES, {
    open: (status) =>
      (OPEN_INVOICE_STATUSES as readonly string[]).includes(status),
  });

  const items = rows.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    balanceDue: invoiceOutstanding(inv),
    dueDate: inv.dueDate,
    sentAt: inv.sentAt,
    estimateId: inv.estimateId,
    customerName: inv.estimate.siteMeasure.location?.customer?.name ?? null,
  }));

  return { items, total, facets };
}
