import { describe, expect, it } from "vitest";
import {
  type InvoiceableEstimateRow,
  toInvoiceableCandidates,
} from "@/lib/quickCreate/candidates";

function row(
  over: Partial<InvoiceableEstimateRow> = {}
): InvoiceableEstimateRow {
  return {
    id: 1,
    estimateNumber: 5001,
    status: "approved",
    total: 5000,
    siteMeasure: {
      location: {
        address: "142 Maple Dr",
        customer: { name: "Henderson, J." },
      },
    },
    invoices: [],
    ...over,
  };
}

describe("toInvoiceableCandidates", () => {
  it("includes an estimate with no invoices, billing the full total as unbilled", () => {
    const [c] = toInvoiceableCandidates([row()]);
    expect(c).toEqual({
      id: 1,
      estimateNumber: 5001,
      status: "approved",
      customerName: "Henderson, J.",
      address: "142 Maple Dr",
      total: 5000,
      unbilled: 5000,
    });
  });

  it("excludes a fully-invoiced estimate (unbilled <= 0)", () => {
    const out = toInvoiceableCandidates([
      row({ invoices: [{ amount: 5000, status: "sent" }] }),
    ]);
    expect(out).toEqual([]);
  });

  it("reports the remaining balance for a partially-invoiced estimate", () => {
    const [c] = toInvoiceableCandidates([
      row({ invoices: [{ amount: 2000, status: "paid" }] }),
    ]);
    expect(c.unbilled).toBe(3000);
    expect(c.total).toBe(5000);
  });

  it("ignores voided invoices when computing unbilled", () => {
    const [c] = toInvoiceableCandidates([
      row({
        invoices: [
          { amount: 5000, status: "void" },
          { amount: 1000, status: "sent" },
        ],
      }),
    ]);
    expect(c.unbilled).toBe(4000);
  });

  it("includes a draft estimate that has a total (any remaining balance is billable)", () => {
    const out = toInvoiceableCandidates([
      row({ status: "draft", invoices: [] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("draft");
  });

  it("excludes an estimate with no total", () => {
    expect(toInvoiceableCandidates([row({ total: null })])).toEqual([]);
    expect(toInvoiceableCandidates([row({ total: 0 })])).toEqual([]);
  });

  it("falls back gracefully when customer / address are missing", () => {
    const [c] = toInvoiceableCandidates([
      row({ siteMeasure: { location: null } }),
    ]);
    expect(c.customerName).toBe("—");
    expect(c.address).toBeNull();
  });
});
