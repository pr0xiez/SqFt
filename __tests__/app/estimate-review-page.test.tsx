// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicEstimatePage from "@/app/estimate-review/[token]/page";
import { snapshotEstimate } from "@/lib/estimateView/snapshot";
import { QtyMode } from "@/lib/utils";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/repositories", () => ({
  getEstimateByToken: vi.fn(),
  markEstimateViewed: vi.fn(async () => undefined),
}));

const { getEstimateByToken, markEstimateViewed } = await import(
  "@/lib/repositories"
);

const TOKEN = "tok_0123456789abcdef";

/** A live estimate row as `getEstimateByToken` returns it. The line item is
 *  priced so live and snapshot renders are visibly different in each test. */
function liveEstimate(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    estimateNumber: 5001,
    status: "sent",
    date: new Date("2026-05-01T00:00:00Z"),
    markupPct: 0,
    depositPct: 0,
    sentAt: new Date("2026-05-01T00:00:00Z"),
    viewedAt: null,
    approvedAt: null,
    declinedAt: null,
    declineReason: null,
    approval: null,
    siteMeasure: {
      id: 7,
      siteMeasureNumber: 3,
      location: {
        address: "1247 Elm St",
        customer: { name: "J. Henderson", email: "h@example.com" },
      },
      items: [
        {
          id: 1,
          type: "room",
          shape: "rect",
          w: 10,
          l: 10,
          segments: null,
          name: "Living",
          note: null,
          text: null,
        },
      ],
    },
    lineItems: [
      {
        id: 11,
        name: "LVP",
        rate: 20, // live rate — edited after approval in the snapshot tests
        qtyMode: QtyMode.Manual,
        qty: 100,
        wastePct: 0,
        unitLabel: "ft²",
        linkedRoomIds: [],
        sortOrder: 0,
      },
    ],
    org: {
      name: "Mike's Flooring",
      phone: null,
      address: null,
      licenseNumber: null,
      logo: null,
      users: [{ email: "owner@example.com" }],
    },
    ...over,
  };
}

/** The snapshot as written at approval time: same estimate, but the customer
 *  signed at rate 10 → total $1,000 (live rows now say rate 20 → $2,000). */
function approvalSnapshot() {
  return JSON.parse(
    JSON.stringify(
      snapshotEstimate(
        {
          markupPct: 0,
          depositPct: 0,
          items: [
            {
              id: 1,
              type: "room",
              shape: "rect",
              w: 10,
              l: 10,
              name: "Living",
              note: null,
              text: null,
            },
          ],
          lineItems: [
            {
              id: 11,
              name: "LVP",
              rate: 10,
              qtyMode: QtyMode.Manual,
              qty: 100,
              wastePct: 0,
              unitLabel: "ft²",
              linkedRoomIds: [],
              sortOrder: 0,
            },
          ],
        },
        {
          estimateNumber: 5001,
          date: new Date("2026-05-01T00:00:00Z"),
          customer: {
            name: "J. Henderson",
            address: "1247 Elm St",
            email: "h@example.com",
            phone: null,
          },
          org: {
            name: "Mike's Flooring",
            address: null,
            phone: null,
            licenseNumber: null,
            logo: null,
          },
        }
      )
    )
  );
}

async function renderPage() {
  const jsx = await PublicEstimatePage({
    params: Promise.resolve({ token: TOKEN }),
  });
  return render(jsx);
}

beforeEach(() => {
  vi.mocked(getEstimateByToken).mockReset();
  vi.mocked(markEstimateViewed).mockClear();
});

describe("PublicEstimatePage — approved estimates render the frozen snapshot", () => {
  it("shows the signed totals, not the live (since-edited) rows", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue(
      liveEstimate({
        status: "approved",
        approvedAt: new Date("2026-05-02T00:00:00Z"),
        approval: {
          id: 1,
          estimateId: 42,
          approvedAt: new Date("2026-05-02T00:00:00Z"),
          ip: "1.1.1.1",
          userAgent: "x",
          snapshot: approvalSnapshot(),
        },
      }) as never
    );

    await renderPage();

    // Signed at rate 10 × 100 = $1,000; live rows would say $2,000.
    expect(screen.getAllByText("$1000.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$2000.00")).toBeNull();
  });

  it("never recomputes from live data even when the site measure changed", async () => {
    const est = liveEstimate({
      status: "approved",
      approval: {
        id: 1,
        estimateId: 42,
        approvedAt: new Date("2026-05-02T00:00:00Z"),
        ip: "1.1.1.1",
        userAgent: "x",
        snapshot: approvalSnapshot(),
      },
    });
    // Post-approval site-measure edit: the room doubles in size, and the live
    // line item is now linked to it.
    (est.siteMeasure as { items: Array<{ w: number; l: number }> }).items[0].w =
      20;
    (
      est.lineItems as Array<{ qtyMode: string; linkedRoomIds: number[] }>
    )[0].qtyMode = QtyMode.LinkedArea;
    (est.lineItems as Array<{ linkedRoomIds: number[] }>)[0].linkedRoomIds = [
      1,
    ];
    vi.mocked(getEstimateByToken).mockResolvedValue(est as never);

    await renderPage();

    expect(screen.getAllByText("$1000.00").length).toBeGreaterThan(0);
  });

  it("falls back to the live render when the snapshot fails validation", async () => {
    const errorSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    vi.mocked(getEstimateByToken).mockResolvedValue(
      liveEstimate({
        status: "approved",
        approval: {
          id: 1,
          estimateId: 42,
          approvedAt: new Date("2026-05-02T00:00:00Z"),
          ip: "1.1.1.1",
          userAgent: "x",
          snapshot: { corrupted: true },
        },
      }) as never
    );

    await renderPage();

    // Live rows: rate 20 × 100 = $2,000.
    expect(screen.getAllByText("$2000.00").length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed validation")
    );
    errorSpy.mockRestore();
  });

  it("does not mark an approved estimate as viewed", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue(
      liveEstimate({
        status: "approved",
        approval: {
          id: 1,
          estimateId: 42,
          approvedAt: new Date("2026-05-02T00:00:00Z"),
          ip: "1.1.1.1",
          userAgent: "x",
          snapshot: approvalSnapshot(),
        },
      }) as never
    );

    await renderPage();

    expect(markEstimateViewed).not.toHaveBeenCalled();
  });
});

describe("PublicEstimatePage — pre-approval estimates still render live", () => {
  it("renders a sent estimate from the live rows and marks it viewed", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue(liveEstimate() as never);

    await renderPage();

    expect(screen.getAllByText("$2000.00").length).toBeGreaterThan(0);
    expect(markEstimateViewed).toHaveBeenCalledWith(42, expect.any(Object));
  });

  it("still renders when markEstimateViewed rejects, and logs the failure instead of dropping it", async () => {
    const errorSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(markEstimateViewed).mockRejectedValueOnce(
      new Error("pool exhausted")
    );
    vi.mocked(getEstimateByToken).mockResolvedValue(liveEstimate() as never);

    await renderPage();
    // Let the fire-and-forget rejection's microtask settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getAllByText("$2000.00").length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("markEstimateViewed failed for estimate 42")
    );
    expect(consoleErrorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
