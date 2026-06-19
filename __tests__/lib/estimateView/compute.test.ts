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

describe("computeEstimateView — cent rounding (issue #158)", () => {
  /** Every monetary output of the SSOT view is rounded to whole cents — no raw
   *  IEEE-754 float drift escapes. */
  const isExactCents = (n: number) => n === Math.round(n * 100) / 100;

  it("rounds the per-line subtotal so qty × rate never drifts past cents", () => {
    // 0.1 * 0.2 = 0.020000000000000004 in IEEE-754; rounded it is exactly 0.02.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 0.1, rate: 0.2 })],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    expect(v.lines[0].subtotal).toBe(0.02);
    expect(v.subtotal).toBe(0.02);
  });

  it("rounds markup/fee/total/deposit to exact cents (no 100.33000000000001)", () => {
    const v = computeEstimateView({
      // subtotal 100.30; the classic float case is 100.3 + 0.03.
      lineItems: [baseLi({ qty: 1, rate: 100.3 })],
      items: [],
      markupPct: 7.5, // markup = 7.5225 → 7.52
      convenienceFeeRate: 0.029, // fee on (100.30+7.52)=107.82 → 3.126.. → 3.13
      depositPct: 0.5,
    });
    for (const n of [
      v.subtotal,
      v.markup,
      v.beforeFee,
      v.convenienceFee,
      v.total,
      v.deposit,
    ]) {
      expect(isExactCents(n)).toBe(true);
    }
    // total reconciles exactly from the two rounded components.
    expect(v.total).toBe(
      Math.round((v.beforeFee + v.convenienceFee) * 100) / 100
    );
  });

  it("produces a total that reconciles with the summed rounded breakdown", () => {
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 33.33, rate: 3 }), // 99.99
        baseLi({ id: 2, qty: 1, rate: 0.005 }), // 0.01 (rounds up)
      ],
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });
    const lineSum =
      Math.round(v.lines.reduce((s, l) => s + (l.subtotal ?? 0), 0) * 100) /
      100;
    expect(v.subtotal).toBe(lineSum);
    expect(v.total).toBe(v.subtotal);
  });
});
