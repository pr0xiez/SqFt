// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicInvoice } from "@/components/invoices/PublicInvoiceView";
import { PublicInvoiceView } from "@/components/invoices/PublicInvoiceView";
import { ToastProvider } from "@/components/ui/Toast";

/** Shared base invoice — override per-test. */
const base: PublicInvoice = {
  invoiceNumber: 7465,
  status: "sent",
  dueLabel: null,
  amountFormatted: "$5,000.00",
  paidFormatted: null,
  balanceDueFormatted: "$5,000.00",
  memo: null,
  terms: "",
  paymentInstructions: "",
  canPayOnline: false,
  token: "test-token-1234567890abcdef",
  payResult: null,
  sessionId: null,
  org: { name: "All About Hardwood", phone: null, address: null, logo: null },
  customer: null,
  lines: [{ name: "Hardwood Install", description: null, amount: 5000 }],
};

function renderInvoice(overrides: Partial<PublicInvoice>) {
  return render(
    <ToastProvider>
      <PublicInvoiceView invoice={{ ...base, ...overrides }} />
    </ToastProvider>
  );
}

describe("PublicInvoiceView", () => {
  it("renders the balance due, bill-to, and prorated lines", () => {
    renderInvoice({
      invoiceNumber: 7465,
      status: "sent",
      dueLabel: "6/6/2026",
      amountFormatted: "$7,403.50",
      balanceDueFormatted: "$7,403.50",
      memo: "Deposit",
      terms: "50% to schedule, bal upon compl",
      paymentInstructions: "WARNING…",
      customer: { name: "Mr. Alex Hall", address: "3722 Amity Lane" },
      lines: [
        {
          name: "Carpet Tear Out",
          description: "Remove carpet",
          amount: 153.5,
        },
      ],
    });
    expect(screen.getByText("Balance due")).toBeDefined();
    expect(screen.getByText("Mr. Alex Hall")).toBeDefined();
    expect(screen.getByText("Carpet Tear Out")).toBeDefined();
  });

  it("shows invoice total, paid to date, and remaining balance after a partial payment", () => {
    renderInvoice({
      invoiceNumber: 7466,
      status: "partial",
      amountFormatted: "$5000.00",
      paidFormatted: "$2500.00",
      balanceDueFormatted: "$2500.00",
    });
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
    renderInvoice({ invoiceNumber: 7467, status: "sent" });
    expect(screen.queryByText("Invoice total")).toBeNull();
    expect(screen.queryByText("Paid to date")).toBeNull();
    expect(screen.getByText("Balance due")).toBeDefined();
  });

  it("does not show a Pay now button when canPayOnline is false", () => {
    renderInvoice({ canPayOnline: false });
    expect(screen.queryByRole("button", { name: /pay now/i })).toBeNull();
  });

  it("shows the Pay now button when canPayOnline is true", () => {
    renderInvoice({ canPayOnline: true });
    expect(screen.getByRole("button", { name: /pay now/i })).toBeDefined();
  });

  it("does NOT show a confirmed banner from ?pay=success alone (no verified session)", () => {
    // `?pay=success` is attacker-controllable on this unauthenticated page.
    // Without a session id to verify against Stripe, no "Payment received"
    // banner may render — otherwise anyone could screenshot a fake confirmation.
    renderInvoice({ payResult: "success", sessionId: null });
    expect(screen.queryByText("Payment received — thank you!")).toBeNull();
  });

  it("shows the cancelled note when payResult is 'cancelled'", () => {
    renderInvoice({ payResult: "cancelled" });
    expect(screen.getByText(/payment cancelled/i)).toBeDefined();
  });
});
