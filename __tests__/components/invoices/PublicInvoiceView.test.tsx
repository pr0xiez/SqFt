// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicInvoiceView } from "@/components/invoices/PublicInvoiceView";

describe("PublicInvoiceView", () => {
  it("renders the balance due, bill-to, and prorated lines", () => {
    render(
      <PublicInvoiceView
        invoice={{
          invoiceNumber: 7465,
          status: "sent",
          dueLabel: "6/6/2026",
          amountFormatted: "$7,403.50",
          paidFormatted: null,
          balanceDueFormatted: "$7,403.50",
          memo: "Deposit",
          terms: "50% to schedule, bal upon compl",
          paymentInstructions: "WARNING…",
          payUrl: null,
          org: {
            name: "All About Hardwood",
            phone: null,
            address: null,
            logo: null,
          },
          customer: { name: "Mr. Alex Hall", address: "3722 Amity Lane" },
          lines: [
            {
              name: "Carpet Tear Out",
              description: "Remove carpet",
              amount: 153.5,
            },
          ],
        }}
      />
    );
    expect(screen.getByText("Balance due")).toBeDefined();
    expect(screen.getByText("Mr. Alex Hall")).toBeDefined();
    expect(screen.getByText("Carpet Tear Out")).toBeDefined();
  });

  it("shows invoice total, paid to date, and remaining balance after a partial payment", () => {
    render(
      <PublicInvoiceView
        invoice={{
          invoiceNumber: 7466,
          status: "partial",
          dueLabel: null,
          amountFormatted: "$5000.00",
          paidFormatted: "$2500.00",
          balanceDueFormatted: "$2500.00",
          memo: null,
          terms: "",
          paymentInstructions: "",
          payUrl: null,
          org: {
            name: "All About Hardwood",
            phone: null,
            address: null,
            logo: null,
          },
          customer: null,
          lines: [
            { name: "Hardwood Install", description: null, amount: 5000 },
          ],
        }}
      />
    );
    expect(screen.getByText("Invoice total")).toBeDefined();
    expect(screen.getByText("Paid to date")).toBeDefined();
    expect(screen.getByText("−$2500.00")).toBeDefined();
    // Balance due row (and the header amount) show the remaining balance,
    // not the full invoice amount.
    const balanceRow = screen.getByText("Balance due").parentElement;
    expect(balanceRow?.textContent).toContain("$2500.00");
    expect(balanceRow?.textContent).not.toContain("$5000.00");
  });

  it("shows only the balance-due row when nothing has been paid", () => {
    render(
      <PublicInvoiceView
        invoice={{
          invoiceNumber: 7467,
          status: "sent",
          dueLabel: null,
          amountFormatted: "$5000.00",
          paidFormatted: null,
          balanceDueFormatted: "$5000.00",
          memo: null,
          terms: "",
          paymentInstructions: "",
          payUrl: null,
          org: {
            name: "All About Hardwood",
            phone: null,
            address: null,
            logo: null,
          },
          customer: null,
          lines: [
            { name: "Hardwood Install", description: null, amount: 5000 },
          ],
        }}
      />
    );
    expect(screen.queryByText("Invoice total")).toBeNull();
    expect(screen.queryByText("Paid to date")).toBeNull();
    expect(screen.getByText("Balance due")).toBeDefined();
  });

  it("never shows a Pay invoice CTA for a voided invoice, even with a payUrl", () => {
    render(
      <PublicInvoiceView
        invoice={{
          invoiceNumber: 7468,
          status: "void",
          dueLabel: null,
          amountFormatted: "$5000.00",
          paidFormatted: null,
          balanceDueFormatted: "$5000.00",
          memo: null,
          terms: "",
          paymentInstructions: "",
          payUrl: "https://pay.stripe.com/abc123",
          org: {
            name: "All About Hardwood",
            phone: null,
            address: null,
            logo: null,
          },
          customer: null,
          lines: [
            { name: "Hardwood Install", description: null, amount: 5000 },
          ],
        }}
      />
    );
    expect(screen.queryByRole("link", { name: "Pay invoice" })).toBeNull();
  });
});
