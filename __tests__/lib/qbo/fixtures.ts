import type { TaxableInvoiceSnapshot } from "@/lib/qbo/mapping";

/** Minimal frozen-snapshot fixture matching lib/invoices/types.ts. */
export function makeSnapshot(
  overrides: Partial<TaxableInvoiceSnapshot> = {}
): TaxableInvoiceSnapshot {
  return {
    invoiceNumber: 42,
    date: "2026-07-01T12:00:00.000Z",
    dueDate: "2026-07-31T00:00:00.000Z",
    memo: "Deposit for LVP install",
    terms: "Net 30",
    paymentInstructions: "",
    pct: null,
    amount: 450,
    customer: {
      name: "Sam Waters",
      address: "1 Main St",
      email: "sam@example.com",
      phone: "555-0100",
    },
    org: {
      name: "Acme Floors",
      address: null,
      phone: null,
      licenseNumber: null,
      logoUrl: null,
    },
    stripePaymentLinkUrl: null,
    lines: [
      { name: "LVP install", description: "Living room", amount: 300 },
      { name: "Trim", description: null, amount: 150 },
    ],
    totals: { subtotal: 500, markup: 50, balanceDue: 450, ...overrides.totals },
    ...overrides,
  };
}
