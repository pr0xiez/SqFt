import { describe, expect, it } from "vitest";
import { computeEstimateBilling, prorateInvoice } from "@/lib/invoices/compute";
import type { ProrationSource } from "@/lib/invoices/types";

describe("computeEstimateBilling", () => {
  it("rolls up invoiced/unbilled/paid/outstanding over non-void invoices", () => {
    const b = computeEstimateBilling(14807, [
      { amount: 7403.5, status: "paid", paidAmount: 7403.5 },
      { amount: 3000, status: "sent", paidAmount: 1000 },
      { amount: 5000, status: "void", paidAmount: 0 },
    ]);
    expect(b).toEqual({
      total: 14807,
      invoiced: 10403.5,
      unbilled: 4403.5,
      paid: 8403.5,
      outstanding: 2000,
    });
  });

  it("clamps unbilled at 0 and treats null total as 0", () => {
    expect(computeEstimateBilling(null, []).total).toBe(0);
    const b = computeEstimateBilling(100, [
      { amount: 150, status: "sent", paidAmount: 0 },
    ]);
    expect(b.unbilled).toBe(0);
  });
});

describe("prorateInvoice", () => {
  const source: ProrationSource = {
    view: {
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 307 },
        { id: 2, effectiveQty: 1, subtotal: 3380 },
      ],
      subtotal: 3687,
      markup: 0,
      beforeFee: 3687,
      convenienceFee: 0,
      total: 3687,
      deposit: 0,
      hasUnresolvedLines: false,
    },
    lineMeta: [
      { id: 1, name: "Carpet Tear Out", description: "Remove carpet" },
      { id: 2, name: "RED OAK", description: "Install oak" },
    ],
  };

  it("prorates each line by the bill ratio at 50%", () => {
    const out = prorateInvoice(source, 1843.5);
    expect(out.ratio).toBeCloseTo(0.5, 6);
    expect(out.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 },
      { name: "RED OAK", description: "Install oak", amount: 1690 },
    ]);
    expect(out.total).toBe(1843.5);
  });

  it("reconciles rounding so line amounts sum exactly to the bill amount", () => {
    const out = prorateInvoice(source, 1000);
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
    expect(out.total).toBe(1000);
  });

  it("folds markup into line amounts and keeps the convenience-fee row (never a Markup row)", () => {
    const withFees: ProrationSource = {
      ...source,
      view: {
        ...source.view,
        markup: 368.7,
        beforeFee: 4055.7,
        convenienceFee: 50,
        total: 4105.7,
      },
    };
    const out = prorateInvoice(withFees, 4105.7); // ratio 1
    const names = out.lines.map((l) => l.name);
    expect(names).not.toContain("Markup");
    expect(names).toContain("Convenience fee");
    expect(out.lines.find((l) => l.name === "RED OAK")?.amount).toBe(3718);
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(4105.7);
  });

  it("reconciles a PARTIAL invoice with folded markup AND a convenience fee, placing the cent on the largest line (not the fee)", () => {
    // subtotal 3687 + 10% markup → beforeFee 4055.7, plus a $100 convenience
    // fee → total 4155.7. Billed at $1000 (ratio ≈ 0.2406). Folded+prorated
    // lines come to 81.26 + 894.67 = 975.93 and the fee prorates to 24.06,
    // summing to 999.99 — a cent short. The +0.01 residual lands on the LARGEST
    // row (RED OAK 894.67 → 894.68), so the convenience fee stays exactly
    // fee×ratio (24.06) rather than absorbing the cent.
    const withMarkupAndFee: ProrationSource = {
      ...source,
      view: {
        ...source.view,
        markup: 368.7,
        beforeFee: 4055.7,
        convenienceFee: 100,
        total: 4155.7,
      },
    };
    const out = prorateInvoice(withMarkupAndFee, 1000);
    expect(out.ratio).toBeCloseTo(0.2406, 4);
    expect(out.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 81.26 },
      { name: "RED OAK", description: "Install oak", amount: 894.68 },
      { name: "Convenience fee", description: null, amount: 24.06 },
    ]);
    // Fee row is undistorted: exactly fee × ratio (drift went to the line).
    const fee = out.lines.find((l) => l.name === "Convenience fee");
    expect(fee?.amount).toBe(Math.round(100 * (1000 / 4155.7) * 100) / 100);
    expect(out.lines.map((l) => l.name)).not.toContain("Markup");
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
    expect(out.total).toBe(1000);
  });

  it("never bills a $0 (free) line on a partial invoice (residual goes to the largest row)", () => {
    // Three 33.33/33.34 lines + a $0 'Free haul-away' line, billed at 50%.
    // Each line prorates to 16.67 → rows sum 50.01, a cent over; the −0.01
    // residual must hit the largest row, NOT the free line. Under the old
    // 'last row' rule the free line would have rendered −$0.01.
    const freeSource: ProrationSource = {
      view: {
        lines: [
          { id: 1, effectiveQty: 1, subtotal: 33.33 },
          { id: 2, effectiveQty: 1, subtotal: 33.33 },
          { id: 3, effectiveQty: 1, subtotal: 33.34 },
          { id: 4, effectiveQty: 1, subtotal: 0 },
        ],
        subtotal: 100,
        markup: 0,
        beforeFee: 100,
        convenienceFee: 0,
        total: 100,
        deposit: 0,
        hasUnresolvedLines: false,
      },
      lineMeta: [
        { id: 1, name: "Tear out", description: null },
        { id: 2, name: "Underlay", description: null },
        { id: 3, name: "RED OAK", description: null },
        { id: 4, name: "Free haul-away", description: null },
      ],
    };
    const out = prorateInvoice(freeSource, 50);
    const free = out.lines.find((l) => l.name === "Free haul-away");
    expect(free?.amount).toBe(0); // never a phantom ±cent
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(50);
    expect(out.total).toBe(50);
  });

  it("omits UNRESOLVED (null) lines from the breakdown instead of billing them as $0", () => {
    // A line whose qty can't be resolved (subtotal null) must NOT appear as a
    // $0 row — that would be indistinguishable from a deliberate free line.
    // It is dropped entirely; the resolved rows still reconcile to the amount.
    const withUnresolved: ProrationSource = {
      view: {
        lines: [
          { id: 1, effectiveQty: 1, subtotal: 1000 },
          { id: 2, effectiveQty: null, subtotal: null }, // unresolved
          { id: 3, effectiveQty: 1, subtotal: 3000 },
        ],
        subtotal: 4000,
        markup: 0,
        beforeFee: 4000,
        convenienceFee: 0,
        total: 4000,
        deposit: 0,
        hasUnresolvedLines: true,
      },
      lineMeta: [
        { id: 1, name: "Carpet tear-out", description: null },
        { id: 2, name: "Stair nosing", description: null },
        { id: 3, name: "Red oak install", description: null },
      ],
    };
    const out = prorateInvoice(withUnresolved, 4000);
    // 'Stair nosing' is dropped, not shown as $0.00.
    expect(out.lines.map((l) => l.name)).toEqual([
      "Carpet tear-out",
      "Red oak install",
    ]);
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(4000);
    expect(out.total).toBe(4000);
  });

  it("pairs each line's name/description to its computed math by id, not array position", () => {
    // lineMeta is supplied in a DIFFERENT order than view.lines. A positional
    // pairing would label the $307 line "RED OAK" and the $3380 line "Carpet
    // Tear Out"; id-based pairing must keep each name on its own computed amount.
    const reordered: ProrationSource = {
      ...source,
      lineMeta: [
        { id: 2, name: "RED OAK", description: "Install oak" },
        { id: 1, name: "Carpet Tear Out", description: "Remove carpet" },
      ],
    };
    const out = prorateInvoice(reordered, 1843.5); // ratio 0.5
    // Rows follow view.lines order (id 1 then id 2) but carry the right names.
    expect(out.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 },
      { name: "RED OAK", description: "Install oak", amount: 1690 },
    ]);
  });

  it("throws when a computed line has no matching metadata (invariant violation)", () => {
    const missingMeta: ProrationSource = {
      ...source,
      lineMeta: [
        { id: 1, name: "Carpet Tear Out", description: "Remove carpet" },
      ],
    };
    expect(() => prorateInvoice(missingMeta, 1843.5)).toThrow(/line metadata/);
  });
});
