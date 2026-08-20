import type { EstimateView, LineView } from "@/lib/estimateView/types";

/** One invoice's billable identity for math purposes. */
export interface InvoiceLike {
  /** Dollar amount billed by this invoice. */
  amount: number;
  /** Lifecycle status. Voided invoices are excluded from billing math. */
  status: string;
  /** Sum of recorded payments on this invoice (caller pre-aggregates). */
  paidAmount: number;
}

/** Estimate-level rollup across all of an estimate's invoices. */
export interface EstimateBilling {
  total: number;
  /** Σ amount over non-void invoices. */
  invoiced: number;
  /** total − invoiced (never below 0). */
  unbilled: number;
  /** Σ paid over non-void invoices. */
  paid: number;
  /** invoiced − paid. */
  outstanding: number;
}

/** A single prorated row in an invoice's displayed breakdown. A `type` (not
 *  an `interface`) — it's persisted verbatim inside `InvoiceSnapshot.lines`,
 *  and TypeScript only infers the implicit string index signature JSON
 *  columns need (`Prisma.InputJsonValue`) for type literals, not for named
 *  interfaces, so keeping this a `type` is what lets `InvoiceSnapshot` reach
 *  the Prisma write with no `as never` cast. */
export type ProratedLine = {
  name: string;
  description: string | null;
  amount: number;
};

/** The full prorated breakdown for one invoice. */
export interface ProratedBreakdown {
  /** ratio = amount / estimateTotal (0 when estimateTotal is 0). */
  ratio: number;
  lines: ProratedLine[];
  /** Reconciled to equal the invoice amount exactly. */
  total: number;
}

/** Estimate-view + the source line metadata proration needs.
 *  `lineMeta` carries each line's `id` so proration can re-pair metadata to the
 *  computed `view.lines` by id rather than by array position — see
 *  `prorateInvoice`. */
export interface ProrationSource {
  view: EstimateView;
  lineMeta: Array<{
    id: LineView["id"];
    name: string;
    description: string | null;
  }>;
}

export interface InvoiceSnapshotMeta {
  invoiceNumber: number;
  date: Date | string;
  dueDate: Date | string | null;
  memo: string | null;
  terms: string;
  paymentInstructions: string;
  pct: number | null;
  amount: number;
  customer: {
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  org: {
    name: string;
    address: string | null;
    phone: string | null;
    licenseNumber: string | null;
    logoUrl: string | null;
  };
  stripePaymentLinkUrl: string | null;
}

/** The frozen, customer-facing invoice artifact. A `type` (not an
 *  `interface extends ...`) so the whole tree is directly assignable to
 *  `Prisma.InputJsonValue` — see `ProratedLine` for why — letting the
 *  persistence call site pass this value straight to the Prisma write
 *  without an `as never` escape hatch. A future field that isn't JSON-safe
 *  (e.g. a `Date` or a class instance) becomes a compile error right here
 *  instead of a silent runtime cast. */
export type InvoiceSnapshot = Omit<InvoiceSnapshotMeta, "date" | "dueDate"> & {
  date: string;
  dueDate: string | null;
  lines: ProratedLine[];
  totals: {
    subtotal: number;
    markup: number;
    balanceDue: number;
  };
};
