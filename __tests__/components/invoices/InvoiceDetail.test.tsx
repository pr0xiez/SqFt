// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";

// InvoiceDetail always mounts its dialogs (closed), whose hooks run before
// their open-guards — so the dialogs' providers must be satisfied here too.
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const partiallyPaidInvoice = {
  id: 9,
  estimateId: 3,
  invoiceNumber: 7465,
  status: "partial",
  amount: 5000,
  pct: null,
  memo: null,
  terms: "",
  coverNote: "",
  paymentInstructions: "",
  date: "2026-06-01T00:00:00.000Z",
  dueDate: null,
  publicToken: "tok",
  sentAt: "2026-06-01T00:00:00.000Z",
  sentToEmail: null,
  viewedAt: null,
  paidAt: null,
  voidedAt: null,
  snapshot: {
    lines: [{ name: "Carpet Tear Out", description: null, amount: 5000 }],
  },
  payments: [
    {
      id: 1,
      amount: 2500,
      method: "check",
      reference: null,
      paidAt: "2026-06-02T00:00:00.000Z",
    },
  ],
  invoiceEvents: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(partiallyPaidInvoice), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    )
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvoiceDetail", () => {
  it("shows the remaining balance (amount − payments) as Balance due", async () => {
    render(wrap(<InvoiceDetail invoiceId={9} estimateId={3} />));
    await waitFor(() => expect(screen.getByText("Balance due")).toBeDefined());
    const balanceRow = screen.getByText("Balance due").parentElement;
    expect(balanceRow?.textContent).toContain("$2500.00");
    expect(balanceRow?.textContent).not.toContain("$5000.00");
    // The full amount stays visible as the invoice total.
    const totalRow = screen.getByText("Invoice total").parentElement;
    expect(totalRow?.textContent).toContain("$5000.00");
  });
});
