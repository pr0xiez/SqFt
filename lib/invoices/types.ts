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

/** Estimate-view + the source line metadata proration needs. */
export interface ProrationSource {
  view: EstimateView;
  lineMeta: Array<{ name: string; description: string | null }>;
  markupLabel?: string;
  convenienceFeeLabel?: string;
}
