// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceListView } from "@/components/invoices/InvoiceList";
import { fmtDollar } from "@/lib/utils";

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
    expect(screen.getAllByText(fmtDollar(3000)).length).toBeGreaterThan(0);
  });

  it("switches the status filter via pills", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Paid/ }));
    await waitFor(() => expect(lastUrl).toContain("status=paid"));
  });

  it("marks overdue partial rows with accent color but not paid rows", async () => {
    const pastDate = "2020-01-01T00:00:00.000Z";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 10,
                invoiceNumber: 1001,
                status: "partial",
                amount: 5000,
                balanceDue: 2000,
                dueDate: pastDate,
                sentAt: "2019-12-01T00:00:00.000Z",
                estimateId: 1,
                customerName: "Overdue Corp",
              },
              {
                id: 11,
                invoiceNumber: 1002,
                status: "paid",
                amount: 5000,
                balanceDue: 0,
                dueDate: pastDate,
                sentAt: "2019-12-01T00:00:00.000Z",
                estimateId: 2,
                customerName: "Paid Corp",
              },
            ],
            total: 2,
            facets: {
              all: 2,
              open: 1,
              draft: 0,
              sent: 0,
              viewed: 0,
              partial: 1,
              paid: 1,
              void: 0,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );
    const { container } = render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#1001")).toBeDefined());

    // fmtDate("2020-01-01T00:00:00.000Z") renders as "Dec 31, 2019" in local time
    // (UTC midnight → previous day in most locales). Query all due-date divs by text.
    const allDivs = Array.from(container.querySelectorAll("div"));
    const dueDateCells = allDivs.filter(
      (el) => el.textContent?.trim() === "Dec 31, 2019"
    );
    expect(dueDateCells.length).toBeGreaterThan(0);

    // The overdue partial row's cell should carry the accent class
    const overdueDueCell = dueDateCells.find((el) =>
      el.className.includes("text-[var(--accent)]")
    );
    expect(overdueDueCell).toBeDefined();

    // The paid row's due cell should NOT carry the accent class (muted instead)
    const paidDueCell = dueDateCells.find(
      (el) =>
        !el.className.includes("text-[var(--accent)]") &&
        el.className.includes("text-[var(--muted)]")
    );
    expect(paidDueCell).toBeDefined();
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
