// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateListView } from "@/components/estimates/EstimateList";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/estimates",
  useSearchParams: () => new URLSearchParams(""),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const facets = {
  all: 2,
  draft: 1,
  sent: 0,
  viewed: 0,
  approved: 1,
  declined: 0,
};

function item(id: number, customer: string, status: string, total: number) {
  return {
    id,
    orgId: "org",
    siteMeasureId: id,
    estimateNumber: 7000 + id,
    status,
    date: "2026-05-01T12:00:00.000Z",
    markupPct: 0,
    depositPct: 0,
    createdAt: "2026-05-01T12:00:00.000Z",
    siteMeasure: {
      id,
      siteMeasureNumber: id,
      title: "Main floor",
      location: {
        id,
        address: `${id} Oak St`,
        customer: { id, name: customer },
      },
    },
    _count: { lineItems: 1 },
    total,
    revisedFromId: null,
  };
}

const listBody = {
  items: [
    item(1, "Dana Floors", "draft", 1200),
    item(2, "Rowan Tile", "approved", 3400),
  ],
  total: 2,
  facets,
};

/** Filter pills carry aria-pressed; row buttons (which also contain status
 *  badge text) do not. */
function pill(name: RegExp) {
  const el = screen
    .getAllByRole("button", { name })
    .find((b) => b.hasAttribute("aria-pressed"));
  if (!el) throw new Error(`No filter pill matching ${name}`);
  return el;
}

let lastUrl = "";
const params = () => new URL(lastUrl, "http://x").searchParams;

beforeEach(() => {
  lastUrl = "";
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      lastUrl = String(url);
      return json(listBody);
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EstimateListView", () => {
  it("renders rows with customer and estimate number, default all filter", async () => {
    render(wrap(<EstimateListView />));
    await screen.findAllByText("Dana Floors");
    expect(screen.getAllByText("Rowan Tile").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#7001").length).toBeGreaterThan(0);
    expect(params().get("status")).toBeNull();
    expect(params().get("sort")).toBe("date");
    expect(params().get("dir")).toBe("desc");
  });

  it("filters by status when a facet pill is clicked", async () => {
    render(wrap(<EstimateListView />));
    await screen.findAllByText("Dana Floors");
    fireEvent.click(pill(/Approved/));
    await waitFor(() => expect(params().get("status")).toBe("approved"));
    fireEvent.click(pill(/Draft/));
    await waitFor(() => expect(params().get("status")).toBe("draft"));
  });

  it("re-sorts when a sort header is clicked", async () => {
    render(wrap(<EstimateListView />));
    await screen.findAllByText("Dana Floors");
    fireEvent.click(screen.getByRole("button", { name: /Sort by Total/ }));
    await waitFor(() => expect(params().get("sort")).toBe("total"));
    expect(params().get("dir")).toBe("desc");
    fireEvent.click(screen.getByRole("button", { name: /Sort by Customer/ }));
    await waitFor(() => expect(params().get("sort")).toBe("customer"));
    expect(params().get("dir")).toBe("asc");
  });

  it("renders a distinct error state with retry, not an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ error: { code: "INTERNAL", message: "boom" } }, 500)
      )
    );
    render(wrap(<EstimateListView />));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Something went wrong loading estimates."
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(screen.queryByText("No estimates yet.")).toBeNull();
  });

  it("shows the empty state when there are no estimates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: [],
          total: 0,
          facets: { ...facets, all: 0, draft: 0, approved: 0 },
        })
      )
    );
    render(wrap(<EstimateListView />));
    await screen.findByText("No estimates yet.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the no-match state when a filter narrows to zero", async () => {
    render(wrap(<EstimateListView />));
    await screen.findAllByText("Dana Floors");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ items: [], total: 0, facets }))
    );
    fireEvent.click(pill(/Declined/));
    await screen.findByText(/No estimates match/);
  });
});
