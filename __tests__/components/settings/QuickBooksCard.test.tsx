// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickBooksCard } from "@/components/settings/QuickBooksCard";
import type { QboStatus } from "@/lib/hooks/useQbo";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const health = {
  pending: 2,
  failed: 1,
  done: 14,
  pausedAuth: 0,
  recentErrors: [],
};

function status(overrides: Partial<QboStatus> = {}): QboStatus {
  return {
    configured: true,
    connection: null,
    health: null,
    ...overrides,
  };
}

const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ url: "https://intuit.example/authorize" }), {
      status: 200,
    })
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuickBooksCard", () => {
  it("renders nothing when the deployment has no QBO env", () => {
    const { container } = render(
      wrap(<QuickBooksCard status={status({ configured: false })} />)
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("unconnected: shows the connect button and starts the OAuth flow", async () => {
    render(wrap(<QuickBooksCard status={status()} />));
    const button = screen.getByRole("button", {
      name: "Connect to QuickBooks",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/qbo/connect", {
        method: "POST",
      })
    );
  });

  it("connected + active: company name, health counts, disconnect", () => {
    render(
      wrap(
        <QuickBooksCard
          status={status({
            connection: {
              status: "active",
              companyName: "Mock Flooring Co",
              realmId: "mock-realm-1",
              connectedAt: "2026-07-01T00:00:00.000Z",
              lastSyncedAt: "2026-07-20T00:00:00.000Z",
            },
            health,
          })}
        />
      )
    );
    expect(screen.getByText("Mock Flooring Co")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument(); // synced
    expect(screen.getByText("2")).toBeInTheDocument(); // pending
    expect(screen.getByText("1")).toBeInTheDocument(); // failed
    expect(
      screen.getByRole("button", { name: "Disconnect" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disconnected: reconnect banner, held-syncs copy, no disconnect button", () => {
    render(
      wrap(
        <QuickBooksCard
          status={status({
            connection: {
              status: "disconnected",
              companyName: "Mock Flooring Co",
              realmId: "mock-realm-1",
              connectedAt: "2026-07-01T00:00:00.000Z",
              lastSyncedAt: null,
            },
            health: { ...health, pausedAuth: 3 },
          })}
        />
      )
    );
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("needs to be reconnected");
    expect(banner).toHaveTextContent("nothing is lost");
    expect(
      screen.getByRole("button", { name: "Reconnect" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disconnect" })
    ).not.toBeInTheDocument();
  });
});
