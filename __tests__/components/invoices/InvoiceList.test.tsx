// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceListView } from "@/components/invoices/InvoiceList";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/invoices",
  useSearchParams: () => new URLSearchParams(""),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const listBody = {
  items: [
    {
      id: 1,
      invoiceNumber: 9001,
      status: "partial",
      amount: 4000,
      balanceDue: 3000,
      dueDate: "2026-05-01T00:00:00.000Z",
      sentAt: "2026-04-20T00:00:00.000Z",
      estimateId: 5,
      customerName: "Dana Floors",
    },
  ],
  total: 1,
  facets: {
    all: 4,
    open: 1,
    draft: 1,
    sent: 0,
    viewed: 0,
    partial: 1,
    paid: 1,
    void: 1,
  },
};

let lastUrl = "";

beforeEach(() => {
  lastUrl = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      lastUrl = String(url);
      return new Response(JSON.stringify(listBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvoiceListView", () => {
  it("defaults to the open filter and renders rows with balance due", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    expect(lastUrl).toContain("status=open");
    expect(screen.getByText("Dana Floors")).toBeDefined();
    // balanceDue 3000 rendered via fmtDollar
    expect(screen.getAllByText(/\$3000/).length).toBeGreaterThan(0);
  });

  it("switches the status filter via pills", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Paid/ }));
    await waitFor(() => expect(lastUrl).toContain("status=paid"));
  });

  it("shows the open-specific empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...listBody,
              items: [],
              total: 0,
              facets: { ...listBody.facets, open: 0 },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );
    render(wrap(<InvoiceListView />));
    await waitFor(() =>
      expect(screen.getByText(/No open invoices/)).toBeDefined()
    );
  });
});
