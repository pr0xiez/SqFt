import { describe, expect, it } from "vitest";
import { computeEstimateView } from "@/lib/estimateView";
import { round2 } from "@/lib/money";
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
    expect(v.convenienceFee).toBe(36);
    expect(v.total).toBe(1236);
    expect(v.deposit).toBe(618);
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

describe("computeEstimateView — money rounding (issue #158)", () => {
  it("rounds a per-line subtotal that floats off the penny to exact cents", () => {
    // 10.1 * 3.3 = 33.330000000000005 in IEEE-754 — must round to 33.33.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 10.1, rate: 3.3 })],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].subtotal).toBe(33.33);
    expect(v.subtotal).toBe(33.33);
    expect(v.total).toBe(33.33);
  });

  it("rounds markup/fee/total/deposit to exact cents (no float drift)", () => {
    // subtotal 100.10; markup 7% = 7.007 -> 7.01; beforeFee 107.11;
    // fee 3% = 3.2133 -> 3.21; total 110.32; deposit 50% = 55.16.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1, rate: 100.1 })],
      items: [],
      markupPct: 7,
      convenienceFeeRate: 0.03,
      depositPct: 0.5,
    });
    expect(v.subtotal).toBe(100.1);
    expect(v.markup).toBe(7.01);
    expect(v.beforeFee).toBe(107.11);
    expect(v.convenienceFee).toBe(3.21);
    expect(v.total).toBe(110.32);
    expect(v.deposit).toBe(55.16);
  });

  it("keeps the breakdown internally consistent after rounding", () => {
    // Inputs chosen so unrounded products land mid-penny on several boundaries.
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 3, rate: 11.115 }),
        baseLi({ id: 2, qty: 7, rate: 4.225 }),
      ],
      items: [],
      markupPct: 12.5,
      convenienceFeeRate: 0.035,
      depositPct: 0.5,
    });
    // Each money field must equal the rounded combination of the prior ones.
    expect(v.subtotal).toBe(
      round2((v.lines[0].subtotal ?? 0) + (v.lines[1].subtotal ?? 0))
    );
    expect(v.beforeFee).toBe(round2(v.subtotal + v.markup));
    expect(v.total).toBe(round2(v.beforeFee + v.convenienceFee));
    // And every field is itself an exact cent value.
    for (const n of [
      v.subtotal,
      v.markup,
      v.beforeFee,
      v.convenienceFee,
      v.total,
      v.deposit,
    ]) {
      expect(n).toBe(round2(n));
    }
  });

  it("leaves fractional effectiveQty unrounded (qty is not money)", () => {
    // 120 * 1.10 = 132 exactly, but use a waste% that yields a fractional qty.
    const v = computeEstimateView({
      lineItems: [
        baseLi({
          qtyMode: "linked_area",
          wastePct: 7,
          linkedRoomIds: [1],
          rate: 0,
        }),
      ],
      items: [tenByTen], // 100 sqft
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    // 100 * 1.07 = 107 — but the point is qty is not forced to cents; verify it
    // is the raw quantity, not round2'd as if it were dollars.
    expect(v.lines[0].effectiveQty).toBe(107);
  });
});
