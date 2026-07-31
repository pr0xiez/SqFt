import { beforeEach, describe, expect, it, vi } from "vitest";

const getInvoiceByToken = vi.fn();
const getOrgStripe = vi.fn();
const markInvoiceViewed = vi.fn();

vi.mock("@/lib/repositories", () => ({
  getInvoiceByToken: (...args: unknown[]) => getInvoiceByToken(...args),
  getOrgStripe: (...args: unknown[]) => getOrgStripe(...args),
  markInvoiceViewed: (...args: unknown[]) => markInvoiceViewed(...args),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: PublicInvoicePage } = await import(
  "@/app/invoice-review/[token]/page"
);

const validToken = "a".repeat(20);

function callPage(overrides: { pay?: string; session_id?: string } = {}) {
  return PublicInvoicePage({
    params: Promise.resolve({ token: validToken }),
    searchParams: Promise.resolve(overrides),
  });
}

describe("PublicInvoicePage", () => {
  beforeEach(() => {
    getInvoiceByToken.mockReset();
    getOrgStripe.mockReset();
    markInvoiceViewed.mockReset();
    getOrgStripe.mockResolvedValue({ stripeConnectStatus: "none" });
    markInvoiceViewed.mockResolvedValue(undefined);
  });

  it("404s instead of crashing when the frozen snapshot is missing required fields", async () => {
    getInvoiceByToken.mockResolvedValue({
      id: 1,
      orgId: "org_1",
      invoiceNumber: 42,
      status: "sent",
      amount: 100,
      // No `org` at all — the kind of drift an old, frozen snapshot could have.
      snapshot: { memo: null, terms: "", paymentInstructions: "", lines: [] },
      payments: [],
    });

    await expect(callPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders normally for a well-formed snapshot", async () => {
    getInvoiceByToken.mockResolvedValue({
      id: 1,
      orgId: "org_1",
      invoiceNumber: 42,
      status: "sent",
      amount: 100,
      snapshot: {
        invoiceNumber: 42,
        date: "2026-06-05T00:00:00.000Z",
        dueDate: null,
        memo: null,
        terms: "",
        paymentInstructions: "",
        pct: null,
        amount: 100,
        customer: null,
        org: {
          name: "All About Hardwood",
          address: null,
          phone: null,
          licenseNumber: null,
          logoUrl: null,
        },
        stripePaymentLinkUrl: null,
        lines: [{ name: "Install", description: null, amount: 100 }],
        totals: { subtotal: 100, markup: 0, balanceDue: 100 },
      },
      payments: [],
    });

    const result = await callPage();
    expect(result).toBeTruthy();
  });
});
