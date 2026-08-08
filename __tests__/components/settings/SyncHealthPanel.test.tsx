// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncHealthPanel } from "@/components/settings/SyncHealthPanel";
import type { QboStatus } from "@/lib/hooks/useQbo";

function status(
  recentErrors: NonNullable<QboStatus["health"]>["recentErrors"]
): QboStatus {
  return {
    configured: true,
    connection: {
      status: "active",
      companyName: "Mock Flooring Co",
      realmId: "mock-realm-1",
      connectedAt: "2026-07-01T00:00:00.000Z",
      lastSyncedAt: null,
    },
    health: {
      pending: 0,
      failed: recentErrors.length,
      done: 0,
      pausedAuth: 0,
      recentErrors,
    },
  };
}

describe("SyncHealthPanel", () => {
  it("renders nothing when there are no failures", () => {
    const { container } = render(<SyncHealthPanel status={status([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each failure with its lastError and a retry surface attached", () => {
    render(
      <SyncHealthPanel
        status={status([
          {
            id: 1,
            kind: "sync_invoice",
            entityId: 42,
            invoiceId: 42,
            lastError: "every DocNumber candidate is taken",
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
          {
            id: 2,
            kind: "sync_customer",
            entityId: 7,
            invoiceId: null,
            lastError: "Duplicate Name Exists Error",
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
          {
            id: 3,
            kind: "sync_payment",
            entityId: 9,
            invoiceId: 42,
            lastError: "Payment write returned no entity",
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
        ])}
      />
    );
    expect(screen.getByText("Sync issues")).toBeInTheDocument();
    expect(screen.getByText("Invoice #42")).toBeInTheDocument();
    expect(
      screen.getByText(/every DocNumber candidate is taken/)
    ).toBeInTheDocument();
    expect(screen.getByText("Customer #7")).toBeInTheDocument();
    expect(screen.getByText(/Duplicate Name Exists Error/)).toBeInTheDocument();
    expect(screen.getByText("Payment #9")).toBeInTheDocument();

    // Every failure row points at a recovery surface: invoice AND payment
    // rows retry from the invoice page (requeue covers the payments), and
    // customer rows point at the customer (saving re-queues the sync).
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/invoices/42",
      "/customers/7",
      "/invoices/42",
    ]);
  });
});
