import { describe, expect, it } from "vitest";
import { foldMarkupIntoLines } from "@/lib/estimateView/markup";
import type { EstimateView } from "@/lib/estimateView/types";

function view(partial: Partial<EstimateView>): EstimateView {
  return {
    lines: [],
    subtotal: 0,
    markup: 0,
    beforeFee: 0,
    convenienceFee: 0,
    total: 0,
    deposit: 0,
    hasUnresolvedLines: false,
    ...partial,
  };
}

describe("foldMarkupIntoLines", () => {
  it("returns line subtotals unchanged when markup is zero", () => {
    const v = view({
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 307 },
        { id: 2, effectiveQty: 1, subtotal: 3380 },
      ],
      subtotal: 3687,
      beforeFee: 3687,
      total: 3687,
    });
    expect(foldMarkupIntoLines(v)).toEqual([307, 3380]);
  });

  it("distributes markup proportionally and sums exactly to beforeFee", () => {
    const v = view({
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 307 },
        { id: 2, effectiveQty: 1, subtotal: 3380 },
      ],
      subtotal: 3687,
      markup: 368.7,
      beforeFee: 4055.7,
      total: 4055.7,
    });
    const out = foldMarkupIntoLines(v);
    expect(out).toEqual([337.7, 3718]);
    expect(out.reduce<number>((s, a) => s + (a ?? 0), 0)).toBeCloseTo(
      4055.7,
      6
    );
  });

  it("leaves unresolved lines null and reconciles drift onto the last resolved line", () => {
    const v = view({
      lines: [
        { id: 1, effectiveQty: null, subtotal: null },
        { id: 2, effectiveQty: 1, subtotal: 100 },
      ],
      subtotal: 100,
      markup: 33.34,
      beforeFee: 133.34,
      total: 133.34,
    });
    const out = foldMarkupIntoLines(v);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(133.34);
  });

  it("reconciles rounding drift onto the last resolved line so folded amounts sum exactly to beforeFee", () => {
    // 33.33 / 33.33 / 33.34 at 10% markup → 36.663 / 36.663 / 36.674.
    // Per-line round2 gives 36.66 / 36.66 / 36.67 = 109.99 — a cent short of
    // beforeFee (110). The drift branch must add the missing +0.01 to the last
    // resolved line. (None of the cases above produce drift !== 0.)
    const v = view({
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 33.33 },
        { id: 2, effectiveQty: 1, subtotal: 33.33 },
        { id: 3, effectiveQty: 1, subtotal: 33.34 },
      ],
      subtotal: 100,
      markup: 10,
      beforeFee: 110,
      total: 110,
    });
    const out = foldMarkupIntoLines(v);
    expect(out).toEqual([36.66, 36.66, 36.68]);
    expect(out.reduce<number>((s, a) => s + (a ?? 0), 0)).toBe(110);
  });

  it("skips a trailing unresolved line and reconciles drift onto the last RESOLVED line", () => {
    // Same drift as above, but the final line is unresolved (null). The
    // backward scan must skip the null and adjust line 3, leaving null in place.
    const v = view({
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 33.33 },
        { id: 2, effectiveQty: 1, subtotal: 33.33 },
        { id: 3, effectiveQty: 1, subtotal: 33.34 },
        { id: 4, effectiveQty: null, subtotal: null },
      ],
      subtotal: 100,
      markup: 10,
      beforeFee: 110,
      total: 110,
    });
    const out = foldMarkupIntoLines(v);
    expect(out).toEqual([36.66, 36.66, 36.68, null]);
    expect(out[3]).toBeNull();
    expect(out.reduce<number>((s, a) => s + (a ?? 0), 0)).toBe(110);
  });
});
