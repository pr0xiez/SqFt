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
});
