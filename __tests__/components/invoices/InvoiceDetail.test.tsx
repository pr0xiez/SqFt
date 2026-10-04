// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  hasPublicToken: true,
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
  trail: {
    customer: { id: 4, name: "Dana Whitfield" },
    siteMeasure: { id: 2, siteMeasureNumber: 1002 },
    estimate: { id: 3, estimateNumber: 5003 },
    address: "12 Elm St",
  },
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

  // Regression coverage for #319 (CWE-201/522): the invoice detail payload
  // never carries the raw `publicToken` — "copy public link" must fetch the
  // live token from the dedicated rotate endpoint instead.
  it("copies the link fetched from the public-token endpoint, not from the detail payload", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/public-token")) {
        return new Response(JSON.stringify({ publicToken: "fresh-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(partiallyPaidInvoice), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    render(wrap(<InvoiceDetail invoiceId={9} estimateId={3} />));
    const copyButton = await screen.findByText("copy public link");
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invoices/9/public-token",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/invoice-review/fresh-token")
      )
    );
  });
});
