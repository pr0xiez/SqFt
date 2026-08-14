import { describe, expect, it } from "vitest";
import {
  computeEstimateBilling,
  invoiceOutstanding,
  isInvoiceOverdue,
  paymentsPaidTotal,
  prorateInvoice,
} from "@/lib/invoices/compute";
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

  it("matches metadata to each computed line BY ID, not by array position", () => {
    // lineMeta is in a DIFFERENT order than view.lines (id 2 first, id 1
    // second). A positional join would mislabel the rows; keying by id keeps
    // each row's name/description attached to the right computed amount.
    const diverged: ProrationSource = {
      view: {
        lines: [
          { id: 1, effectiveQty: 1, subtotal: 307 },
          { id: 2, effectiveQty: 1, subtotal: 3380 },
        ],
        subtotal: 3687,
        markup: 0,
        total: 3687,
        deposit: 0,
        hasUnresolvedLines: false,
      },
      lineMeta: [
        { id: 2, name: "RED OAK", description: "Install oak" },
        { id: 1, name: "Carpet Tear Out", description: "Remove carpet" },
      ],
    };
    const out = prorateInvoice(diverged, 3687); // ratio 1
    // Row order follows view.lines (id 1 then id 2); names track by id.
    expect(out.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 307 },
      { name: "RED OAK", description: "Install oak", amount: 3380 },
    ]);
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
});

describe("paymentsPaidTotal", () => {
  it("sums payment amounts", () => {
    expect(paymentsPaidTotal([{ amount: 100 }, { amount: 50.5 }])).toBe(150.5);
  });

  it("returns 0 for no payments", () => {
    expect(paymentsPaidTotal([])).toBe(0);
  });
});

describe("invoiceOutstanding", () => {
  it("subtracts paid total from the invoice amount, rounded to cents", () => {
    expect(
      invoiceOutstanding({
        amount: 1000,
        payments: [{ amount: 250 }, { amount: 100 }],
      })
    ).toBe(650);
  });

  it("equals the full amount when there are no payments", () => {
    expect(invoiceOutstanding({ amount: 1000, payments: [] })).toBe(1000);
  });
});

describe("isInvoiceOverdue", () => {
  it("is false for a non-open status even with a past due date", () => {
    expect(isInvoiceOverdue({ status: "draft", dueDate: "2000-01-01" })).toBe(
      false
    );
    expect(isInvoiceOverdue({ status: "paid", dueDate: "2000-01-01" })).toBe(
      false
    );
  });

  it("is false for an open status with no due date", () => {
    expect(isInvoiceOverdue({ status: "sent", dueDate: null })).toBe(false);
  });

  it("is false on the due date itself, true the day after (end-of-day boundary)", () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    expect(
      isInvoiceOverdue({ status: "sent", dueDate: `${y}-${m}-${d}` })
    ).toBe(false);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yy = yesterday.getFullYear();
    const ym = String(yesterday.getMonth() + 1).padStart(2, "0");
    const yd = String(yesterday.getDate()).padStart(2, "0");
    expect(
      isInvoiceOverdue({
        status: "partial",
        dueDate: `${yy}-${ym}-${yd}`,
      })
    ).toBe(true);
  });
});
