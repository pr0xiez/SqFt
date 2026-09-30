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
      depositPct: 0,
    });
    expect(v.lines[0].effectiveQty).toBe(150);
  });

  it("returns null when manual qty is null", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: null })],
      items: [],
      markupPct: 0,
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
      depositPct: 0,
    });
    expect(v.subtotal).toBe(370); // 350 + 20
  });

  it("applies markup to subtotal; total is subtotal + markup", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1000, rate: 1 })], // subtotal 1000
      items: [],
      markupPct: 20, // markup = 200
      depositPct: 0.5, // deposit = 1200 * 0.5 = 600
    });
    expect(v.subtotal).toBe(1000);
    expect(v.markup).toBe(200);
    expect(v.total).toBeCloseTo(1200);
    expect(v.deposit).toBeCloseTo(600);
  });

  it("treats unresolved lines as 0 in subtotal but flags them", () => {
    const v = computeEstimateView({
      lineItems: [
        baseLi({ id: 1, qty: 100, rate: 1 }), // resolves to 100
        baseLi({ id: 2, qtyMode: "linked_area", linkedRoomIds: [99] }), // unresolved
      ],
      items: [],
      markupPct: 0,
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
      depositPct: 0.5,
    });
    expect(v.subtotal).toBe(0);
    expect(v.total).toBe(0);
    expect(v.hasUnresolvedLines).toBe(false);
  });
});

describe("computeEstimateView — rounding (issue #158)", () => {
  it("rounds every returned money field to cents, never a raw binary float", () => {
    // qty=1, rate=0.07, markupPct=12: raw subtotal*markup/total arithmetic
    // produces 0.0784 as 0.07840000000000001 in IEEE-754. Every field below
    // must come back as an exact 2-decimal number.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1, rate: 0.07 })],
      items: [],
      markupPct: 12,
      depositPct: 0.5,
    });
    expect(v.lines[0].subtotal).toBe(0.07);
    expect(v.subtotal).toBe(0.07);
    expect(v.markup).toBe(0.01);
    expect(v.total).toBe(0.08);
    expect(v.deposit).toBe(0.04);
  });

  it("derives total from already-rounded subtotal + markup, not a rounded raw sum", () => {
    // subtotal=1.50, markup=1.5*37%=0.555 (mathematically), which rounds
    // half-up to 0.56. Rounding the RAW float sum (1.5 + 0.5549999999999999
    // = 2.0549999999999997) would incorrectly floor to 2.05 — the raw double
    // undershoots 2.055 due to binary representation error, and round2's
    // half-up nudge never gets a chance to see it. Deriving total from the
    // already-rounded subtotal/markup (1.50 + 0.56 = 2.06) is the
    // mathematically correct half-up result and matches the convention
    // `foldMarkupIntoLines` uses for line-level amounts.
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1, rate: 1.5 })],
      items: [],
      markupPct: 37,
      depositPct: 0.5,
    });
    expect(v.subtotal).toBe(1.5);
    expect(v.markup).toBe(0.56);
    expect(v.total).toBe(2.06);
    expect(v.deposit).toBe(1.03);
  });
});
