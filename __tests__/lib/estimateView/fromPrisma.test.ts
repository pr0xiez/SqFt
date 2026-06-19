import { describe, expect, it } from "vitest";
import { computeEstimateView } from "@/lib/estimateView/compute";
import { fromPrismaEstimate } from "@/lib/estimateView/fromPrisma";

/** A minimal stand-in for a Prisma `Decimal`: any object whose `toString()`
 *  returns the exact decimal string. `fromPrismaEstimate` must coerce these to
 *  JS numbers so the estimate-view math is storage-type agnostic (Float today,
 *  `numeric`/Decimal after a future migration — see issue #158). */
const dec = (s: string) => ({ toString: () => s });

describe("fromPrismaEstimate — Decimal-safe coercion (issue #158)", () => {
  it("accepts number columns (current Float schema)", () => {
    const input = fromPrismaEstimate({
      markupPct: 10,
      convenienceFeeRate: 0.03,
      depositPct: 0.5,
      lineItems: [
        {
          id: 1,
          name: "Carpet",
          description: null,
          rate: 3.5,
          qtyMode: "manual",
          qty: 100,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
        },
      ],
      siteMeasure: { items: [] },
    });
    expect(input.lineItems[0].rate).toBe(3.5);
    expect(input.markupPct).toBe(10);
    expect(computeEstimateView(input).subtotal).toBe(350);
  });

  it("coerces Decimal-like columns to numbers and computes the same view", () => {
    const input = fromPrismaEstimate({
      markupPct: dec("10"),
      convenienceFeeRate: dec("0.03"),
      depositPct: dec("0.5"),
      lineItems: [
        {
          id: 1,
          name: "Carpet",
          description: null,
          rate: dec("3.5"),
          qtyMode: "manual",
          qty: dec("100"),
          wastePct: dec("0"),
          unitLabel: "ft²",
          linkedRoomIds: [],
        },
      ],
      siteMeasure: { items: [] },
    });
    expect(input.lineItems[0].rate).toBe(3.5);
    expect(input.lineItems[0].qty).toBe(100);
    expect(input.markupPct).toBe(10);
    expect(input.convenienceFeeRate).toBe(0.03);
    const view = computeEstimateView(input);
    expect(view.subtotal).toBe(350);
    expect(view.markup).toBe(35);
    expect(view.total).toBe(396.55); // (350 + 35) * 1.03
  });

  it("preserves null for a nullable money column (qty)", () => {
    const input = fromPrismaEstimate({
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
      lineItems: [
        {
          id: 1,
          name: "Manual line, no qty",
          description: null,
          rate: dec("5"),
          qtyMode: "manual",
          qty: null,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
        },
      ],
      siteMeasure: { items: [] },
    });
    expect(input.lineItems[0].qty).toBeNull();
    expect(computeEstimateView(input).hasUnresolvedLines).toBe(true);
  });
});
