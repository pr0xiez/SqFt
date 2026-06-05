import type { EstimateView } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Fold markup into each line's displayed price. Returns per-line amounts with
 * markup distributed proportionally, reconciled so the resolved amounts sum
 * exactly to `view.beforeFee` (subtotal + markup). Unresolved lines (null
 * subtotal) stay null and receive no markup. Markup is never surfaced to
 * customers as its own line — it is an internal pricing setting.
 */
export function foldMarkupIntoLines(view: EstimateView): Array<number | null> {
  const factor = view.subtotal === 0 ? 0 : view.beforeFee / view.subtotal;
  const amounts = view.lines.map((l) =>
    l.subtotal == null ? null : round2(l.subtotal * factor)
  );
  const target = round2(view.beforeFee);
  const sum = round2(amounts.reduce((s, a) => s + (a ?? 0), 0));
  const drift = round2(target - sum);
  if (drift !== 0) {
    for (let i = amounts.length - 1; i >= 0; i--) {
      if (amounts[i] != null) {
        amounts[i] = round2((amounts[i] as number) + drift);
        break;
      }
    }
  }
  return amounts;
}
