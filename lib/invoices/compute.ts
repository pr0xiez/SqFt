import type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";

/** Round to cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Estimate-level billing rollup. Voided invoices are ignored. */
export function computeEstimateBilling(
  estimateTotal: number | null,
  invoices: InvoiceLike[]
): EstimateBilling {
  const total = estimateTotal ?? 0;
  let invoiced = 0;
  let paid = 0;
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    invoiced += inv.amount;
    paid += inv.paidAmount;
  }
  invoiced = round2(invoiced);
  paid = round2(paid);
  return {
    total: round2(total),
    invoiced,
    unbilled: round2(Math.max(0, total - invoiced)),
    paid,
    outstanding: round2(invoiced - paid),
  };
}

/**
 * Prorate an estimate's labeled breakdown (line subtotals + markup + fee) by
 * `amount / estimateTotal`, then reconcile rounding onto the last row so the
 * displayed rows sum EXACTLY to `amount`. Markup/fee rows appear only when the
 * underlying value is non-zero.
 */
export function prorateInvoice(
  source: ProrationSource,
  amount: number
): ProratedBreakdown {
  const estimateTotal = source.view.total;
  const ratio = estimateTotal === 0 ? 0 : amount / estimateTotal;

  const rows: ProratedLine[] = [];
  source.view.lines.forEach((line, idx) => {
    const meta = source.lineMeta[idx];
    rows.push({
      name: meta?.name ?? `Item ${idx + 1}`,
      description: meta?.description ?? null,
      amount: round2((line.subtotal ?? 0) * ratio),
    });
  });
  if (source.view.markup > 0) {
    rows.push({
      name: source.markupLabel ?? "Markup",
      description: null,
      amount: round2(source.view.markup * ratio),
    });
  }
  if (source.view.convenienceFee > 0) {
    rows.push({
      name: source.convenienceFeeLabel ?? "Convenience fee",
      description: null,
      amount: round2(source.view.convenienceFee * ratio),
    });
  }

  // Reconcile: force the sum to equal `amount` by adjusting the last row.
  const target = round2(amount);
  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const drift = round2(target - sum);
  if (drift !== 0 && rows.length > 0) {
    const last = rows[rows.length - 1];
    last.amount = round2(last.amount + drift);
  }

  return { ratio, lines: rows, total: target };
}
