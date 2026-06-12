import { describe, expect, it } from "vitest";
import { computeEstimateView } from "@/lib/estimateView";
import type { LineItemCalc, RoomItem } from "@/lib/utils";

const baseLi = (over: Partial<LineItemCalc> = {}): LineItemCalc => ({
  id: 1,
  name: "x",
  rate: 1,
  qtyMode: "manual",
  qty: null,
  wastePct: 0,
  unitLabel: "sqft",
  linkedRoomIds: [],
  ...over,
});

const tenByTen: RoomItem = {
  id: 1,
  type: "room",
  shape: "rect",
  w: "10",
  l: "10",
}; // 100 sqft, 40 lf perimeter

describe("computeEstimateView — effectiveQty resolution", () => {
  it("returns manual qty as effectiveQty", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 150, rate: 0 })],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].effectiveQty).toBe(150);
  });

  it("returns null when manual qty is null", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: null })],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].effectiveQty).toBeNull();
    expect(v.lines[0].subtotal).toBeNull();
    expect(v.hasUnresolvedLines).toBe(true);
  });

  it("sums linked room areas and applies waste% for linked_area", () => {
    const v = computeEstimateView({
      lineItems: [
        baseLi({
          qtyMode: "linked_area",
          wastePct: 10,
          linkedRoomIds: [1, 2],
        }),
      ],
      items: [
        tenByTen,
        { id: 2, type: "room", shape: "rect", w: "5", l: "4" }, // 20 sqft
      ],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    // 120 * 1.10 = 132
    expect(v.lines[0].effectiveQty).toBeCloseTo(132);
  });

  it("sums linked room perimeters for linked_perimeter", () => {
    const v = computeEstimateView({
      lineItems: [
        baseLi({
          qtyMode: "linked_perimeter",
          wastePct: 10,
          linkedRoomIds: [1, 2],
        }),
      ],
      items: [
        tenByTen,
        { id: 2, type: "room", shape: "rect", w: "10", l: "10" },
      ],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    // (40 + 40) * 1.10 = 88
    expect(v.lines[0].effectiveQty).toBeCloseTo(88);
  });

  it("returns null effectiveQty when linked rooms are missing", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qtyMode: "linked_area", linkedRoomIds: [99] })],
      items: [tenByTen],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].effectiveQty).toBeNull();
    expect(v.hasUnresolvedLines).toBe(true);
  });

  it("ignores note items when resolving linked rooms", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qtyMode: "linked_area", linkedRoomIds: [1, 2] })],
      items: [tenByTen, { id: 2, type: "note", text: "see spec" }],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].effectiveQty).toBe(100);
  });
});

describe("computeEstimateView — totals breakdown", () => {
  it("computes subtotal as qty × rate per line, summed", () => {
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 100, rate: 3.5 }),
        baseLi({ id: 2, qty: 10, rate: 2 }),
      ],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.subtotal).toBe(370); // 350 + 20
  });

  it("applies markup to subtotal, then fee to subtotal+markup", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1000, rate: 1 })], // subtotal 1000
      items: [],
      markupPct: 20, // markup = 200
      convenienceFeeRate: 0.03, // fee = 1200 * 0.03 = 36
      depositPct: 0.5, // deposit = 1236 * 0.5 = 618
    });
    expect(v.subtotal).toBe(1000);
    expect(v.markup).toBe(200);
    expect(v.beforeFee).toBe(1200);
    expect(v.convenienceFee).toBeCloseTo(36);
    expect(v.total).toBeCloseTo(1236);
    expect(v.deposit).toBeCloseTo(618);
  });

  it("treats unresolved lines as 0 in subtotal but flags them", () => {
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 100, rate: 1 }), // resolves to 100
        baseLi({ id: 2, qtyMode: "linked_area", linkedRoomIds: [99] }), // unresolved
      ],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.subtotal).toBe(100);
    expect(v.hasUnresolvedLines).toBe(true);
    expect(v.lines[1].subtotal).toBeNull();
  });

  it("returns zeros (not nulls) when there are no line items", () => {
    const v = computeEstimateView({
      lineItems: [],
      items: [],
      markupPct: 20,
      convenienceFeeRate: 0.03,
      depositPct: 0.5,
    });
    expect(v.subtotal).toBe(0);
    expect(v.total).toBe(0);
    expect(v.hasUnresolvedLines).toBe(false);
  });
});

describe("computeEstimateView — money is rounded to cents (no float drift)", () => {
  const isWholeCents = (n: number) => n === Math.round(n * 100) / 100;

  it("rounds each line subtotal to cents", () => {
    // 3 × 100.3 = 300.90000000000003 in IEEE-754; the view must settle to 300.9.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 3, rate: 100.3 })],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].subtotal).toBe(300.9);
    expect(v.subtotal).toBe(300.9);
  });

  it("sums rounded line subtotals so the total never carries binary drift", () => {
    // 100.3 + 0.03 = 100.33000000000001 raw; settled it is exactly 100.33.
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 1, rate: 100.3 }),
        baseLi({ id: 2, qty: 1, rate: 0.03 }),
      ],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.subtotal).toBe(100.33);
    expect(isWholeCents(v.subtotal)).toBe(true);
  });

  it("rounds markup, beforeFee, convenienceFee, total and deposit to whole cents", () => {
    // subtotal 100.10; markup @33% = 33.033 → 33.03; beforeFee 133.13;
    // fee @7.5% = 9.98475 → 9.98; total 143.11; deposit @33% = 47.2263 → 47.23.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1, rate: 100.1 })],
      items: [],
      markupPct: 33,
      convenienceFeeRate: 0.075,
      depositPct: 0.33,
    });
    for (const amount of [
      v.subtotal,
      v.markup,
      v.beforeFee,
      v.convenienceFee,
      v.total,
      v.deposit,
    ]) {
      expect(isWholeCents(amount)).toBe(true);
    }
    expect(v.subtotal).toBe(100.1);
    expect(v.markup).toBe(33.03);
    expect(v.beforeFee).toBe(133.13);
    expect(v.convenienceFee).toBe(9.98);
    expect(v.total).toBe(143.11);
    expect(v.deposit).toBe(47.23);
  });

  it("does not round the qty/rate inputs — only the resulting amounts", () => {
    // effectiveQty is a quantity (waste-applied), not money: it stays unrounded.
    const v = computeEstimateView({
      lineItems: [
        baseLi({ qtyMode: "linked_area", wastePct: 7, linkedRoomIds: [1] }),
      ],
      items: [{ id: 1, type: "room", shape: "rect", w: "10", l: "10.5" }], // 105 sqft
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    // 105 × 1.07 = 112.35 (a non-integer qty that must NOT be rounded to cents)
    expect(v.lines[0].effectiveQty).toBeCloseTo(112.35, 6);
  });
});
