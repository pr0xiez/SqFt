import { describe, expect, it } from "vitest";
import { OVERBILL_EPSILON } from "@/lib/invoices/createInvoiceForm";
import {
  buildInvoiceProrationSource,
  classifyStripeCharge,
  computeInvoiceAmount,
  nextInvoiceStatus,
} from "@/lib/repositories/invoiceRepo";

describe("computeInvoiceAmount", () => {
  it("returns the flat amount when amount is provided", () => {
    expect(computeInvoiceAmount({ estimateTotal: 1000, amount: 250 })).toEqual({
      amount: 250,
      pct: null,
    });
  });
  it("computes amount from pct against the estimate total", () => {
    expect(computeInvoiceAmount({ estimateTotal: 1000, pct: 0.5 })).toEqual({
      amount: 500,
      pct: 0.5,
    });
  });
});

describe("buildInvoiceProrationSource", () => {
  it("maps a hydrated estimate to a ProrationSource with line metadata", () => {
    const src = buildInvoiceProrationSource({
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [
        {
          id: 1,
          name: "Carpet Tear Out",
          description: "Remove carpet",
          rate: 307,
          qtyMode: "manual",
          qty: 1,
          wastePct: 0,
          unitLabel: "job",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
      siteMeasure: { items: [] },
    });
    expect(src.lineMeta).toEqual([
      { id: 1, name: "Carpet Tear Out", description: "Remove carpet" },
    ]);
    expect(src.view.total).toBe(307);
  });
});

describe("nextInvoiceStatus", () => {
  it("stays unpaid (sent/viewed) when nothing is paid", () => {
    expect(nextInvoiceStatus({ current: "sent", amount: 100, paid: 0 })).toBe(
      "sent"
    );
    expect(nextInvoiceStatus({ current: "viewed", amount: 100, paid: 0 })).toBe(
      "viewed"
    );
  });
  it("becomes partial when some but not all is paid", () => {
    expect(nextInvoiceStatus({ current: "sent", amount: 100, paid: 40 })).toBe(
      "partial"
    );
  });
  it("becomes paid when fully covered", () => {
    expect(
      nextInvoiceStatus({ current: "partial", amount: 100, paid: 100 })
    ).toBe("paid");
  });
  it("never changes a void invoice", () => {
    expect(nextInvoiceStatus({ current: "void", amount: 100, paid: 100 })).toBe(
      "void"
    );
  });

  // Pins the paid-in-full threshold to the shared OVERBILL_EPSILON constant
  // (lib/invoices/createInvoiceForm.ts) rather than an inlined literal — this
  // would fail if the two ever diverged, e.g. if someone reintroduced a bare
  // 0.005 (or any other value) at the nextInvoiceStatus call site.
  it("treats paid within OVERBILL_EPSILON of amount as paid (derives from the shared constant)", () => {
    const amount = 100;
    const justWithinTolerance = amount - OVERBILL_EPSILON / 2;
    const justOutsideTolerance = amount - OVERBILL_EPSILON * 2;

    expect(
      nextInvoiceStatus({ current: "sent", amount, paid: justWithinTolerance })
    ).toBe("paid");
    expect(
      nextInvoiceStatus({ current: "sent", amount, paid: justOutsideTolerance })
    ).toBe("partial");
  });
});

describe("classifyStripeCharge", () => {
  it("marks a normal full payment paid, not orphaned or overpaid", () => {
    expect(
      classifyStripeCharge({
        status: "sent",
        amount: 500,
        priorPaid: 0,
        chargeAmount: 500,
      })
    ).toEqual({
      nextStatus: "paid",
      paidAfter: 500,
      orphaned: false,
      overpaid: false,
    });
  });

  it("marks a partial payment partial", () => {
    expect(
      classifyStripeCharge({
        status: "sent",
        amount: 500,
        priorPaid: 200,
        chargeAmount: 100,
      })
    ).toEqual({
      nextStatus: "partial",
      paidAfter: 300,
      orphaned: false,
      overpaid: false,
    });
  });

  it("flags a charge on a void invoice as orphaned and never resurrects it", () => {
    // A Checkout session outlives the invoice: the card is charged after the
    // contractor voids. The money is real, so it must still be recorded — but
    // the invoice stays void and the charge is flagged for refund.
    expect(
      classifyStripeCharge({
        status: "void",
        amount: 500,
        priorPaid: 0,
        chargeAmount: 500,
      })
    ).toEqual({
      nextStatus: "void",
      paidAfter: 500,
      orphaned: true,
      overpaid: false,
    });
  });

  it("flags an overpayment when the total exceeds the invoice amount", () => {
    // Manual payment zeroed the balance, then a stale Stripe session completes.
    expect(
      classifyStripeCharge({
        status: "paid",
        amount: 500,
        priorPaid: 500,
        chargeAmount: 500,
      })
    ).toEqual({
      nextStatus: "paid",
      paidAfter: 1000,
      orphaned: false,
      overpaid: true,
    });
  });

  it("does not flag a cent of rounding as overpayment", () => {
    expect(
      classifyStripeCharge({
        status: "sent",
        amount: 500,
        priorPaid: 0,
        chargeAmount: 500.004,
      }).overpaid
    ).toBe(false);
  });

  // Pins the overpaid threshold to the shared OVERBILL_EPSILON constant, same
  // as the nextInvoiceStatus test above — a divergent literal here would flip
  // one of these two assertions.
  it("flags overpaid only once the excess exceeds OVERBILL_EPSILON (derives from the shared constant)", () => {
    const amount = 500;
    const withinTolerance = classifyStripeCharge({
      status: "sent",
      amount,
      priorPaid: 0,
      chargeAmount: amount + OVERBILL_EPSILON / 2,
    });
    const outsideTolerance = classifyStripeCharge({
      status: "sent",
      amount,
      priorPaid: 0,
      chargeAmount: amount + OVERBILL_EPSILON * 2,
    });

    expect(withinTolerance.overpaid).toBe(false);
    expect(outsideTolerance.overpaid).toBe(true);
  });
});
