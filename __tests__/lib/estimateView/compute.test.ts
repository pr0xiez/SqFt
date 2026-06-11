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

  it("rounds every monetary output to cents (no IEEE-754 drift)", () => {
    // 3 lines that each produce a raw float with trailing-digit drift, plus
    // markup/fee/deposit rates chosen to surface the classic 100.33000000000001
    // artifacts if any figure escaped round2.
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 3, rate: 33.33 }), // 99.99
        baseLi({ id: 2, qty: 7, rate: 14.33 }), // 100.31
        baseLi({ id: 3, qty: 1, rate: 0.1 }), // 0.1
      ],
      items: [],
      markupPct: 17, // exercises subtotal * (17/100)
      convenienceFeeRate: 0.029, // odd rate → fractional cents
      depositPct: 0.5,
    });

    // Every monetary field must be exactly its own round2 — i.e. already at
    // cent precision, with no ...0001 / ...9999 tail.
    const atCents = (n: number) => round2(n) === n;
    expect(atCents(v.subtotal)).toBe(true);
    expect(atCents(v.markup)).toBe(true);
    expect(atCents(v.beforeFee)).toBe(true);
    expect(atCents(v.convenienceFee)).toBe(true);
    expect(atCents(v.total)).toBe(true);
    expect(atCents(v.deposit)).toBe(true);
    for (const line of v.lines) {
      if (line.subtotal !== null) expect(atCents(line.subtotal)).toBe(true);
    }

    // And the breakdown stays internally consistent at cent precision.
    expect(v.subtotal).toBe(200.4); // 99.99 + 100.31 + 0.1
    expect(v.beforeFee).toBe(round2(v.subtotal + v.markup));
    expect(v.total).toBe(round2(v.beforeFee + v.convenienceFee));
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
