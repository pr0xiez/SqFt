// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QboSyncBadge } from "@/components/invoices/QboSyncBadge";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const fetchMock = vi.fn(
  async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QboSyncBadge", () => {
  it("renders nothing when qboSync is null (org not connected)", () => {
    const { container } = render(
      wrap(<QboSyncBadge invoiceId={5} qboSync={null} />)
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the synced state", () => {
    render(
      wrap(
        <QboSyncBadge
          invoiceId={5}
          qboSync={{ state: "synced", lastError: null }}
        />
      )
    );
    expect(screen.getByText(/QuickBooks ✓/)).toBeInTheDocument();
  });

  it("shows the pending state", () => {
    render(
      wrap(
        <QboSyncBadge
          invoiceId={5}
          qboSync={{ state: "pending", lastError: null }}
        />
      )
    );
    expect(screen.getByText(/syncing…/)).toBeInTheDocument();
  });

  it("failed state carries the error and Retry re-queues the sync", async () => {
    render(
      wrap(
        <QboSyncBadge
          invoiceId={5}
          qboSync={{ state: "failed", lastError: "Stale Object Error" }}
        />
      )
    );
    expect(screen.getByText(/failed/)).toBeInTheDocument();
    expect(screen.getByTitle("Stale Object Error")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/invoices/5/qbo-sync", {
        method: "POST",
      })
    );
  });
});
