/** Round to cents (half-up, nudged past binary-float error at the .005 boundary). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Choose which entry absorbs the penny-rounding residual when a list of rounded
 * amounts must sum to an exact target. Returns the index of the largest
 * positive amount, so the ±cent adjustment is the least visible and NEVER lands
 * on a $0 (free) or unresolved (`null`) line.
 *
 * Falls back to the last resolved entry only when every resolved amount is ≤ 0
 * — a degenerate case that in practice carries no residual (a zero/negative
 * subtotal yields a zero/negative `total`, hence zero drift). Returns -1
 * when there is no resolved entry at all.
 */
export function residualTargetIndex(
  amounts: ReadonlyArray<number | null>
): number {
  let best = -1;
  let bestAmount = 0;
  let lastResolved = -1;
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    if (a == null) continue;
    lastResolved = i;
    if (a > bestAmount) {
      bestAmount = a;
      best = i;
    }
  }
  return best !== -1 ? best : lastResolved;
}
