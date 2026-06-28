import { computeEstimateBilling } from "@/lib/invoices";

/**
 * Minimal structural shape of an estimate row needed to decide whether it can
 * be invoiced and to label it in the quick-create panel. Decoupled from Prisma
 * so the logic is unit-testable without a database.
 */
export interface InvoiceableEstimateRow {
  id: number;
  estimateNumber: number;
  status: string;
  /** Denormalized estimate total (null until the estimate has priced lines). */
  total: number | null;
  siteMeasure: {
    location: {
      address: string | null;
      customer: { name: string } | null;
    } | null;
  } | null;
  /** All of the estimate's invoices; voided ones are ignored by the rollup. */
  invoices: Array<{ amount: number; status: string }>;
}

/** A billable estimate surfaced in the quick-invoice search results. */
export interface InvoiceableCandidate {
  id: number;
  estimateNumber: number;
  status: string;
  customerName: string;
  address: string | null;
  total: number;
  /** Remaining balance available to bill (total − non-void invoiced). */
  unbilled: number;
}

/**
 * Project estimate rows to quick-invoice candidates, keeping only those with a
 * remaining balance to bill (`unbilled > 0`). Billing math is delegated to the
 * single source of truth, {@link computeEstimateBilling}, so voided invoices and
 * cents rounding behave identically to the rest of the app.
 */
export function toInvoiceableCandidates(
  rows: InvoiceableEstimateRow[]
): InvoiceableCandidate[] {
  const candidates: InvoiceableCandidate[] = [];
  for (const e of rows) {
    const billing = computeEstimateBilling(
      e.total,
      e.invoices.map((i) => ({
        amount: i.amount,
        status: i.status,
        paidAmount: 0,
      }))
    );
    if (billing.unbilled <= 0) continue;
    candidates.push({
      id: e.id,
      estimateNumber: e.estimateNumber,
      status: e.status,
      customerName: e.siteMeasure?.location?.customer?.name ?? "—",
      address: e.siteMeasure?.location?.address ?? null,
      total: billing.total,
      unbilled: billing.unbilled,
    });
  }
  return candidates;
}
