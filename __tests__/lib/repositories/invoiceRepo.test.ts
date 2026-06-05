import { describe, expect, it } from "vitest";
import {
  buildInvoiceProrationSource,
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
      convenienceFeeRate: 0,
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
      { name: "Carpet Tear Out", description: "Remove carpet" },
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
});
