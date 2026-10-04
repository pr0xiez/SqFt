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

/** Format a date ISO string the same way the component does. */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  it("defaults to the all filter and renders rows with balance due", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    expect(lastUrl).toContain("status=all");
    expect(screen.getByText("Dana Floors")).toBeDefined();
    // balanceDue 3000 rendered via fmtDollar
    expect(screen.getAllByText(fmtDollar(3000)).length).toBeGreaterThan(0);
  });

  it("switches to the open filter via the pill", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    await waitFor(() => expect(lastUrl).toContain("status=open"));
  });

  it("switches the status filter via pills", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Paid/ }));
    await waitFor(() => expect(lastUrl).toContain("status=paid"));
  });

  it("marks overdue partial rows with accent-ink color but not paid rows", async () => {
    // Use a past date that is unambiguously overdue in any timezone.
    // Derive the expected rendered text the same way the component does so the
    // assertion is timezone-safe.
    const pastDate = "2020-01-01T00:00:00.000Z";
    const expectedDateText = fmtDate(pastDate);

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

    // Query all due-date divs by the dynamically computed text.
    const allDivs = Array.from(container.querySelectorAll("div"));
    const dueDateCells = allDivs.filter(
      (el) => el.textContent?.trim() === expectedDateText
    );
    expect(dueDateCells.length).toBeGreaterThan(0);

    // The overdue partial row's cell should carry the accent-ink class
    const overdueDueCell = dueDateCells.find((el) =>
      el.className.includes("text-[var(--accent-ink)]")
    );
    expect(overdueDueCell).toBeDefined();

    // The paid row's due cell should NOT carry the accent-ink class (muted instead)
    const paidDueCell = dueDateCells.find(
      (el) =>
        !el.className.includes("text-[var(--accent-ink)]") &&
        el.className.includes("text-[var(--muted)]")
    );
    expect(paidDueCell).toBeDefined();
  });

  it("does NOT mark as overdue an invoice due today (inclusive due-day boundary)", async () => {
    // Fix 'now' to local noon on 2026-06-15.
    const fakeNow = new Date(2026, 5, 15, 12, 0, 0);
    // dueDate = start of today in local time, expressed as ISO (may be any UTC offset).
    const dueTodayIso = new Date(2026, 5, 15).toISOString();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fakeNow);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 20,
                  invoiceNumber: 2001,
                  status: "partial",
                  amount: 3000,
                  balanceDue: 1500,
                  dueDate: dueTodayIso,
                  sentAt: "2026-06-01T00:00:00.000Z",
                  estimateId: 3,
                  customerName: "Today Corp",
                },
              ],
              total: 1,
              facets: {
                all: 1,
                open: 1,
                draft: 0,
                sent: 0,
                viewed: 0,
                partial: 1,
                paid: 0,
                void: 0,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );

    const { container } = render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#2001")).toBeDefined());

    const expectedDateText = fmtDate(dueTodayIso);
    const allDivs = Array.from(container.querySelectorAll("div"));
    const dueDateCell = allDivs.find(
      (el) => el.textContent?.trim() === expectedDateText
    );
    expect(dueDateCell).toBeDefined();

    // Due today → NOT overdue: no accent-ink class, no title="Overdue"
    expect(dueDateCell?.className.includes("text-[var(--accent-ink)]")).toBe(
      false
    );
    expect(dueDateCell?.getAttribute("title")).not.toBe("Overdue");

    vi.useRealTimers();
  });

  it("marks as overdue an invoice due yesterday (inclusive due-day boundary)", async () => {
    // Fix 'now' to local noon on 2026-06-15.
    const fakeNow = new Date(2026, 5, 15, 12, 0, 0);
    // dueDate = start of yesterday in local time.
    const dueYesterdayIso = new Date(2026, 5, 14).toISOString();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fakeNow);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 21,
                  invoiceNumber: 2002,
                  status: "partial",
                  amount: 3000,
                  balanceDue: 1500,
                  dueDate: dueYesterdayIso,
                  sentAt: "2026-06-01T00:00:00.000Z",
                  estimateId: 4,
                  customerName: "Yesterday Corp",
                },
              ],
              total: 1,
              facets: {
                all: 1,
                open: 1,
                draft: 0,
                sent: 0,
                viewed: 0,
                partial: 1,
                paid: 0,
                void: 0,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );

    const { container } = render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#2002")).toBeDefined());

    const expectedDateText = fmtDate(dueYesterdayIso);
    const allDivs = Array.from(container.querySelectorAll("div"));
    const dueDateCell = allDivs.find(
      (el) => el.textContent?.trim() === expectedDateText
    );
    expect(dueDateCell).toBeDefined();

    // Due yesterday → overdue: accent-ink class present, title="Overdue"
    expect(dueDateCell?.className.includes("text-[var(--accent-ink)]")).toBe(
      true
    );
    expect(dueDateCell?.getAttribute("title")).toBe("Overdue");

    vi.useRealTimers();
  });

  it("shows the open-specific empty state when the Open pill is active", async () => {
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
    // Default is "all"; the open-specific copy only applies under the Open pill.
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    await waitFor(() =>
      expect(screen.getByText(/No open invoices/)).toBeDefined()
    );
  });
});
