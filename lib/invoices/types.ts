import type { EstimateView } from "@/lib/estimateView/types";

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

/** A single prorated row in an invoice's displayed breakdown. */
export interface ProratedLine {
  name: string;
  description: string | null;
  amount: number;
}

/** The full prorated breakdown for one invoice. */
export interface ProratedBreakdown {
  /** ratio = amount / estimateTotal (0 when estimateTotal is 0). */
  ratio: number;
  lines: ProratedLine[];
  /** Reconciled to equal the invoice amount exactly. */
  total: number;
}

/** Estimate-view + the source line metadata proration needs. Each `lineMeta`
 *  entry carries the line `id` so `prorateInvoice` can pair computed math to its
 *  metadata by stable identity, never by fragile array position. */
export interface ProrationSource {
  view: EstimateView;
  lineMeta: Array<{ id: number; name: string; description: string | null }>;
  convenienceFeeLabel?: string;
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

export interface InvoiceSnapshot
  extends Omit<InvoiceSnapshotMeta, "date" | "dueDate"> {
  date: string;
  dueDate: string | null;
  lines: ProratedLine[];
  totals: {
    subtotal: number;
    markup: number;
    convenienceFee: number;
    balanceDue: number;
  };
}
