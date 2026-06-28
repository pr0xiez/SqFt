import { residualTargetIndex, round2 } from "@/lib/money";
import type { EstimateView } from "./types";

/**
 * Fold markup into each line's displayed price. Returns per-line amounts with
 * markup distributed proportionally, reconciled so the resolved amounts sum
 * exactly to `view.total` (subtotal + markup). The rounding residual lands
 * on the largest-priced resolved line, so a $0 (free) line is never charged a
 * phantom cent. Unresolved lines (null subtotal) stay null and receive no
 * markup. Markup is never surfaced to customers as its own line — it is an
 * internal pricing setting.
 */
export function foldMarkupIntoLines(view: EstimateView): Array<number | null> {
  const factor = view.subtotal === 0 ? 0 : view.total / view.subtotal;
  const amounts = view.lines.map((l) =>
    l.subtotal == null ? null : round2(l.subtotal * factor)
  );
  const target = round2(view.total);
  const sum = round2(amounts.reduce<number>((s, a) => s + (a ?? 0), 0));
  const drift = round2(target - sum);
  if (drift !== 0) {
    const i = residualTargetIndex(amounts);
    if (i !== -1) amounts[i] = round2((amounts[i] as number) + drift);
  }
  return amounts;
}
