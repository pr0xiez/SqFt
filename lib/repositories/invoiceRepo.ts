import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { InvoiceLockedError, InvoiceOverbillError } from "@/lib/api/errors";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { computeEstimateBilling } from "@/lib/invoices/compute";
import type { InvoiceLike, ProrationSource } from "@/lib/invoices/types";
import { prisma } from "@/lib/prisma";

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
    lineItems: Array<{ name: string; description: string | null }>;
  },
): ProrationSource {
  const view = computeEstimateView(fromPrismaEstimate(estimate));
  return {
    view,
    lineMeta: estimate.lineItems.map((li) => ({
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

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: typeof INVOICE_INCLUDE;
}>;

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
  orgId: string,
) {
  return prisma.invoice.findMany({
    where: { orgId, estimateId },
    orderBy: { createdAt: "asc" },
    include: INVOICE_INCLUDE,
  });
}

export async function getInvoice(
  id: number,
  orgId: string,
): Promise<InvoiceWithDetails | null> {
  return prisma.invoice.findFirst({
    where: { id, orgId },
    include: INVOICE_INCLUDE,
  });
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
      estimate.invoices.map(toInvoiceLike),
    );
    if (amount > billing.unbilled + 0.005) {
      throw new InvoiceOverbillError(billing.unbilled);
    }

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { nextInvoiceNumber: true, defaultPaymentInstructions: true },
    });
    await tx.organization.update({
      where: { id: orgId },
      data: { nextInvoiceNumber: org.nextInvoiceNumber + 1 },
    });

    return tx.invoice.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        invoiceNumber: org.nextInvoiceNumber,
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
