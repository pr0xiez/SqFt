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
});
