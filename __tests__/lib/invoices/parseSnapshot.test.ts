import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { parseInvoiceSnapshot } from "@/lib/invoices/parseSnapshot";
import type { InvoiceSnapshot } from "@/lib/invoices/types";
import { logError } from "@/lib/logger";

const validSnapshot: InvoiceSnapshot = {
  invoiceNumber: 7465,
  date: "2026-06-05T00:00:00.000Z",
  dueDate: "2026-06-06T00:00:00.000Z",
  memo: "Deposit",
  terms: "50% to schedule, bal upon compl",
  paymentInstructions: "Pay online via the link",
  pct: 0.5,
  amount: 153.5,
  customer: {
    name: "Alex Hall",
    address: "3722 Amity Lane",
    email: null,
    phone: null,
  },
  org: {
    name: "All About Hardwood",
    address: null,
    phone: null,
    licenseNumber: null,
    logoUrl: null,
  },
  stripePaymentLinkUrl: null,
  lines: [
    { name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 },
  ],
  totals: { subtotal: 153.5, markup: 0, balanceDue: 153.5 },
};

describe("parseInvoiceSnapshot", () => {
  it("round-trips a valid snapshot", () => {
    const result = parseInvoiceSnapshot(validSnapshot);
    expect(result).toEqual(validSnapshot);
    expect(logError).not.toHaveBeenCalled();
  });

  it("returns null when org is missing entirely", () => {
    const { org, ...rest } = validSnapshot;
    const result = parseInvoiceSnapshot(rest);
    expect(result).toBeNull();
    expect(logError).toHaveBeenCalled();
  });

  it("returns null when a nested required field (org.name) is missing", () => {
    const { name, ...restOrg } = validSnapshot.org;
    const malformed = { ...validSnapshot, org: restOrg };
    const result = parseInvoiceSnapshot(malformed);
    expect(result).toBeNull();
  });

  it("returns null for null without throwing", () => {
    expect(() => parseInvoiceSnapshot(null)).not.toThrow();
    expect(parseInvoiceSnapshot(null)).toBeNull();
  });

  it("returns null for a string without throwing", () => {
    expect(() => parseInvoiceSnapshot("not an object")).not.toThrow();
    expect(parseInvoiceSnapshot("not an object")).toBeNull();
  });

  it("returns null for an empty object without throwing", () => {
    expect(() => parseInvoiceSnapshot({})).not.toThrow();
    expect(parseInvoiceSnapshot({})).toBeNull();
  });
});
