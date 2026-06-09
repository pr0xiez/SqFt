import { foldMarkupIntoLines } from "@/lib/estimateView/markup";
import { residualTargetIndex, round2 } from "@/lib/money";
import type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";

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
 * Prorate an estimate's labeled breakdown by `amount / estimateTotal`, then
 * reconcile rounding onto the largest row so the displayed rows sum EXACTLY to
 * `amount`. Markup is folded into each line's price (never its own row); the
 * convenience-fee row appears only when the fee is non-zero. Putting the
 * residual on the largest row keeps the ±cent off the convenience-fee row and
 * off any $0 (free) line. Unresolved lines (no resolvable price) are omitted
 * from the breakdown rather than billed as $0.
 */
export function prorateInvoice(
  source: ProrationSource,
  amount: number
): ProratedBreakdown {
  const estimateTotal = source.view.total;
  const ratio = estimateTotal === 0 ? 0 : amount / estimateTotal;
  const folded = foldMarkupIntoLines(source.view);
  // Pair each computed/folded line to its display metadata by STABLE ID, not by
  // array position — a positional join silently mislabels rows (and bills the
  // wrong line) the moment view and metadata diverge in order or count.
  const metaById = new Map(source.lineMeta.map((m) => [m.id, m]));

  const rows: ProratedLine[] = [];
  source.view.lines.forEach((line, idx) => {
    const priced = folded[idx];
    // Unresolved line (no resolvable price): omit it rather than bill $0, so it
    // is never confused with a deliberate $0 (free) line. The builder is warned
    // separately (InvoicesSection) that such lines won't be billed.
    if (priced == null) return;
    const meta = metaById.get(line.id);
    if (!meta) {
      // No metadata matches this computed line's id. Fail loudly rather than
      // render a placeholder name onto a customer-facing/frozen invoice — an
      // ordering/count mismatch must be caught, not papered over.
      throw new Error(
        `prorateInvoice: no line metadata for view line id ${line.id}`
      );
    }
    rows.push({
      name: meta.name,
      description: meta.description,
      amount: round2(priced * ratio),
    });
  });
  if (source.view.convenienceFee > 0) {
    rows.push({
      name: source.convenienceFeeLabel ?? "Convenience fee",
      description: null,
      amount: round2(source.view.convenienceFee * ratio),
    });
  }

  // Reconcile: force the sum to equal `amount` by adjusting the largest row, so
  // the ±cent never distorts the convenience-fee row or a $0 (free) line.
  const target = round2(amount);
  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const drift = round2(target - sum);
  if (drift !== 0) {
    const i = residualTargetIndex(rows.map((r) => r.amount));
    if (i !== -1) rows[i].amount = round2(rows[i].amount + drift);
  }

  return { ratio, lines: rows, total: target };
}
