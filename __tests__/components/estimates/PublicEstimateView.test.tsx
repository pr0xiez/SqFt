// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type PublicEstimate,
  PublicEstimateView,
} from "@/components/estimates/PublicEstimateView";
import { TotalsBlock } from "@/components/estimates/public-estimate/TotalsBlock";
import { computeEstimateView, type EstimateView } from "@/lib/estimateView";
import { type LineItemCalc, QtyMode } from "@/lib/utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const line = (
  id: number,
  name: string,
  rate: number,
  qty: number | null
): LineItemCalc => ({
  id,
  name,
  rate,
  qty,
  qtyMode: QtyMode.Manual,
  wastePct: 0,
  unitLabel: "ea",
  linkedRoomIds: [],
});

const NAMES = ["Install A", "Install B", "Install C", "Unmeasured Trim"];

/** Three equal lines + 5% markup, plus one unresolved line (manual qty never
 *  entered). */
const base: PublicEstimate = {
  id: 1,
  estimateNumber: 1042,
  status: "sent",
  date: "2026-06-01T12:00:00Z",
  markupPct: 5,
  depositPct: 0.5,
  siteMeasure: { id: 9, siteMeasureNumber: 3 },
  customer: { name: "Pat Customer", address: "1 Main St", email: null },
  items: [],
  lineItems: [
    line(1, "Install A", 10.01, 1),
    line(2, "Install B", 10.01, 1),
    line(3, "Install C", 10.01, 1),
    line(4, "Unmeasured Trim", 5, null),
  ],
  org: {
    name: "All About Hardwood",
    phone: "555-0100",
    address: null,
    licenseNumber: null,
    logo: null,
    ownerEmail: "owner@example.com",
  },
  sentAt: "2026-06-02T12:00:00Z",
};

const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);

function renderView(
  overrides: Partial<PublicEstimate> = {},
  frozenView?: EstimateView
) {
  return render(
    <PublicEstimateView
      estimate={{ ...base, ...overrides }}
      token="tok"
      frozenView={frozenView}
    />
  );
}

/** Price cell text for each row of the "Line items" table, keyed by name. */
function linePrices(): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of NAMES) {
    const row = screen.getByText(name).closest("div[class*='grid']");
    out.set(name, (row?.lastElementChild?.textContent ?? "").trim());
  }
  return out;
}

beforeEach(() => {
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe("PublicEstimateView money reconciliation", () => {
  it("never shows a markup / margin line", () => {
    const { container } = renderView();
    expect(container.textContent).not.toMatch(/markup/i);
    expect(container.textContent).not.toMatch(/labor\s*&\s*margin/i);
  });

  it("renders folded line prices that sum exactly to the displayed total", () => {
    renderView();
    const prices = linePrices();
    const sum = NAMES.slice(0, 3)
      .map((n) => cents(prices.get(n) as string))
      .reduce((a, b) => a + b, 0);
    const view = computeEstimateView({
      lineItems: base.lineItems,
      items: base.items,
      markupPct: base.markupPct,
      depositPct: base.depositPct,
    });
    expect(sum).toBe(Math.round(view.total * 100));
    // Lines are marked up (raw subtotal is 30.03), not shown at cost.
    expect(sum).toBeGreaterThan(3003);
    expect(screen.getByText(`$${view.total.toFixed(2)}`)).toBeTruthy();
  });

  it("renders the unresolved line with no price", () => {
    renderView();
    expect(linePrices().get("Unmeasured Trim")).toBe("-");
  });

  it("shows total due and the deposit", () => {
    renderView();
    expect(screen.getByText("Total due")).toBeTruthy();
    expect(screen.getByText(/Deposit due:/)).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("uses the frozen view's numbers instead of recomputing", () => {
    const frozen: EstimateView = {
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 100 },
        { id: 2, effectiveQty: 1, subtotal: 200 },
        { id: 3, effectiveQty: 1, subtotal: 300 },
        { id: 4, effectiveQty: null, subtotal: null },
      ],
      subtotal: 600,
      markup: 0,
      total: 600,
      deposit: 300,
      hasUnresolvedLines: true,
    };
    renderView({ status: "approved" }, frozen);
    const prices = linePrices();
    expect(prices.get("Install A")).toBe("$100.00");
    expect(prices.get("Install B")).toBe("$200.00");
    expect(prices.get("Install C")).toBe("$300.00");
    expect(screen.getByText("$600.00")).toBeTruthy();
  });
});

describe("TotalsBlock", () => {
  it("hides the deposit row when depositPct is 0", () => {
    render(<TotalsBlock total={100} deposit={0} depositPct={0} />);
    expect(screen.getByText("$100.00")).toBeTruthy();
    expect(screen.queryByText(/Deposit due/)).toBeNull();
  });
});

describe("PublicEstimateView status states", () => {
  it("sent: shows awaiting badge, sent date and the accept block", () => {
    renderView();
    expect(screen.getByText("Awaiting your response")).toBeTruthy();
    expect(screen.getByText(/Sent Jun 2, 2026/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Approve & get on the schedule/ })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  it("approved: shows approval date and no accept block", () => {
    renderView({ status: "approved", approvedAt: "2026-06-03T12:00:00Z" });
    expect(screen.getByText(/Approved Jun 3, 2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });

  it("declined: shows reason and contact info, no accept block", () => {
    renderView({
      status: "declined",
      declinedAt: "2026-06-04T12:00:00Z",
      declineReason: "Too pricey",
    });
    expect(screen.getByText(/Declined Jun 4, 2026/)).toBeTruthy();
    expect(screen.getByText(/Too pricey/)).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });
});

describe("accept / decline actions", () => {
  it("approve POSTs to the token endpoint then refreshes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: /Approve & get on the schedule/ })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/estimate-review/tok/approve", {
      method: "POST",
    });
  });

  it("surfaces an approve error and does not refresh", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "BAD", message: "Nope, sorry" } }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: /Approve & get on the schedule/ })
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nope, sorry"
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("decline opens the modal and POSTs the trimmed reason", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    const reason = await screen.findByLabelText(/Reason/);
    fireEvent.change(reason, { target: { value: "  Too pricey  " } });
    fireEvent.click(screen.getByRole("button", { name: "Decline estimate" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/estimate-review/tok/decline");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      reason: "Too pricey",
    });
  });
});
