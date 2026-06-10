import { describe, expect, it } from "vitest";
import {
  deriveInvoiceAmount,
  invoiceLeaves,
  isOverbill,
  OVERBILL_EPSILON,
} from "@/lib/invoices/createInvoiceForm";

describe("deriveInvoiceAmount", () => {
  it("bills the full unbilled balance in 'remaining' mode", () => {
    expect(deriveInvoiceAmount({ mode: "remaining", unbilled: 4000 })).toBe(
      4000
    );
    expect(deriveInvoiceAmount({ mode: "remaining", unbilled: 4403.5 })).toBe(
      4403.5
    );
  });

  it("bills a percent of the unbilled balance in 'pct' mode (not the estimate total)", () => {
    // 30% of 4000 = 1200 (the org default deposit case in the dialog).
    expect(
      deriveInvoiceAmount({ mode: "pct", unbilled: 4000, pct: "30" })
    ).toBe(1200);
    // 33.333% of 1000 → 333.33 after cents rounding.
    expect(
      deriveInvoiceAmount({ mode: "pct", unbilled: 1000, pct: "33.333" })
    ).toBe(333.33);
  });

  it("bills the explicit dollar amount in 'flat' mode", () => {
    expect(
      deriveInvoiceAmount({ mode: "flat", unbilled: 4000, flat: "1500" })
    ).toBe(1500);
    // Sub-cent input is rounded to cents.
    expect(
      deriveInvoiceAmount({ mode: "flat", unbilled: 4000, flat: "1500.005" })
    ).toBe(1500.01);
  });

  it("falls back to 0 for empty / missing / non-numeric pct and flat fields", () => {
    expect(deriveInvoiceAmount({ mode: "pct", unbilled: 4000 })).toBe(0);
    expect(deriveInvoiceAmount({ mode: "pct", unbilled: 4000, pct: "" })).toBe(
      0
    );
    expect(
      deriveInvoiceAmount({ mode: "pct", unbilled: 4000, pct: "abc" })
    ).toBe(0);
    expect(deriveInvoiceAmount({ mode: "flat", unbilled: 4000 })).toBe(0);
    expect(
      deriveInvoiceAmount({ mode: "flat", unbilled: 4000, flat: "" })
    ).toBe(0);
  });

  it("ignores the unused field for the active mode", () => {
    // flat is set but mode is pct → flat is ignored.
    expect(
      deriveInvoiceAmount({
        mode: "pct",
        unbilled: 4000,
        pct: "50",
        flat: "999",
      })
    ).toBe(2000);
    // pct is set but mode is remaining → both pct and flat ignored.
    expect(
      deriveInvoiceAmount({
        mode: "remaining",
        unbilled: 4000,
        pct: "50",
        flat: "999",
      })
    ).toBe(4000);
  });
});

describe("invoiceLeaves", () => {
  it("returns the cents-rounded unbilled remainder", () => {
    expect(invoiceLeaves(4000, 4000)).toBe(0);
    expect(invoiceLeaves(4000, 1200)).toBe(2800);
    expect(invoiceLeaves(4403.5, 1843.5)).toBe(2560);
  });
});

describe("isOverbill", () => {
  it("is false when billing exactly the balance", () => {
    expect(isOverbill(4000, 4000)).toBe(false);
  });

  it("is false within the floating-point tolerance at exactly unbilled + epsilon", () => {
    // Boundary: amount === unbilled + 0.005 is NOT an overbill (strict >).
    expect(isOverbill(4000 + OVERBILL_EPSILON, 4000)).toBe(false);
    expect(OVERBILL_EPSILON).toBe(0.005);
  });

  it("is true just past the tolerance", () => {
    expect(isOverbill(4000 + OVERBILL_EPSILON + 0.001, 4000)).toBe(true);
    expect(isOverbill(9999, 4000)).toBe(true);
    expect(isOverbill(4000.01, 4000)).toBe(true);
  });
});
