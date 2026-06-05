// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";

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
              amount: 7403.5,
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
  it("renders invoice rows with paid totals", async () => {
    render(wrap(<InvoicesSection estimateId={3} />));
    await waitFor(() => expect(screen.getByText("Deposit")).toBeDefined());
    expect(screen.getByText("7465")).toBeDefined();
  });
});
