// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";

// InvoicesSection always mounts CreateInvoiceDialog (closed), whose hooks run
// before its open-guard — so the dialog's providers must be satisfied here too.
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 1,
              invoiceNumber: 7465,
              status: "sent",
              amount: 4000,
              memo: "Deposit",
              dueDate: null,
              payments: [{ amount: 1000 }],
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    )
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvoicesSection", () => {
  it("renders the billing summary and invoice rows", async () => {
    render(
      wrap(
        <InvoicesSection
          estimateId={3}
          estimateTotal={10000}
          defaultDepositPct={0.3}
        />
      )
    );
    await waitFor(() => expect(screen.getByText("7465")).toBeDefined());
    // Invoiced 4000, unbilled 6000 from estimateTotal 10000
    expect(screen.getByText(/\$6000/)).toBeDefined();
    expect(screen.getByText("Deposit")).toBeDefined();
  });

  it("shows an empty state with no invoices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
    );
    render(
      wrap(
        <InvoicesSection
          estimateId={3}
          estimateTotal={10000}
          defaultDepositPct={0.3}
        />
      )
    );
    await waitFor(() =>
      expect(screen.getByText("No invoices yet.")).toBeDefined()
    );
  });
});
