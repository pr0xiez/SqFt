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
      { name: "Carpet Tear Out", description: "Remove carpet" },
      { name: "RED OAK", description: "Install oak" },
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
});
