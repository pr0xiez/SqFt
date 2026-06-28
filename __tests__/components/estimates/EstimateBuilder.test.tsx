// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateBuilderView } from "@/components/estimates/EstimateBuilder";
import type { EstimateDetail } from "@/lib/hooks/useEstimates";
import { type LineItemCalc, QtyMode, type RoomItem } from "@/lib/utils";

// ── Hook mocks ──────────────────────────────────────────────────────────────
// EstimateBuilderView is a thin data-fetch + layout shell that delegates all
// editing to LineItemSection. We mock the data/network hooks so no fetches fire
// and we can observe the save patches the component forwards from the reducer.

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const showToast = vi.fn();

let estimateDetail: EstimateDetail;

vi.mock("@/lib/hooks/useEstimates", () => ({
  useEstimate: () => ({ data: estimateDetail, isLoading: false }),
  useUpdateEstimate: () => ({ mutateAsync }),
  // SendEstimateDialog (rendered but closed) pulls this in.
  useSendEstimate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/hooks/useLineItemTemplates", () => ({
  useLineItemTemplates: () => ({ data: [] }),
}));

// InvoicesSection is rendered below the line-item editor but is out of scope
// here; stub it so its own data/network stack doesn't load.
vi.mock("@/components/invoices/InvoicesSection", () => ({
  InvoicesSection: () => null,
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

// ReviseButton (locked estimates) and CreateInvoiceDialog (inside
// InvoicesSection) call useRouter; jsdom has no Next app-router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// ── Fixtures ────────────────────────────────────────────────────────────────
const ROOM: RoomItem = {
  id: 1,
  type: "room",
  shape: "rect",
  w: "10",
  l: "12", // 120 sqft
  name: "Living Room",
};

function line(over: Partial<LineItemCalc> = {}): LineItemCalc {
  return {
    id: 1,
    name: "Laminate install",
    description: null,
    rate: 5,
    qtyMode: QtyMode.Manual,
    qty: 10,
    wastePct: 0,
    unitLabel: "sqft",
    linkedRoomIds: [],
    sortOrder: 0,
    ...over,
  };
}

function makeEstimate(over: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: 42,
    orgId: "org_1",
    siteMeasureId: 7,
    estimateNumber: 1001,
    status: "draft",
    date: "2026-06-01",
    markupPct: 0,
    depositPct: 0.3,
    approvalToken: null,
    createdAt: "2026-06-01",
    siteMeasure: {
      id: 7,
      title: "SM",
      location: {
        id: 3,
        address: "1 Main St",
        customer: { id: 9, name: "Acme Co", email: "buyer@acme.test" },
      },
      items: [ROOM],
    },
    lineItems: [line()],
    org: { name: "FloorCo", defaultDepositPct: 0.3 },
    ...over,
  };
}

beforeEach(() => {
  mutateAsync.mockClear();
  showToast.mockClear();
  estimateDetail = makeEstimate();
});

function renderBuilder() {
  return render(<EstimateBuilderView estimateId={42} />);
}

/** The most recent patch handed to the update mutation. */
function lastSavePatch() {
  return mutateAsync.mock.calls.at(-1)?.[0];
}

describe("EstimateBuilderView — rendered view reflects reducer output", () => {
  it("renders the seeded line item and its computed subtotal", () => {
    renderBuilder();
    const nameInput = screen.getByDisplayValue("Laminate install");
    expect(nameInput).not.toBeNull();
    // qty 10 × rate 5 = 50.00 surfaces in the totals footer (asserting the view
    // renders compute output, not re-deriving the math — that lives in
    // computeEstimateView's own tests). It can appear in both the line subtotal
    // and the estimate total for a single-line draft, so assert presence.
    expect(screen.queryAllByText("$50.00").length).toBeGreaterThan(0);
  });

  it("shows the empty-state prompt when there are no line items", () => {
    estimateDetail = makeEstimate({ lineItems: [] });
    renderBuilder();
    expect(screen.queryByText(/No line items yet/)).not.toBeNull();
  });
});

describe("EstimateBuilderView — add line item", () => {
  it("adds a row to the displayed draft and persists the new lineItems set", () => {
    renderBuilder();
    fireEvent.click(screen.getByText("+ Add Line Item"));

    // The new blank row appears in the rendered draft (two name inputs now).
    const descs = screen.getAllByPlaceholderText("Description (optional)");
    expect(descs.length).toBe(2);

    // addLineItem persists immediately; the patch carries the grown list.
    const patch = lastSavePatch();
    expect(patch?.lineItems).toHaveLength(2);
  });
});

describe("EstimateBuilderView — edit line item", () => {
  it("commits a rate change and forwards the updated lineItems patch", () => {
    renderBuilder();
    // The rate field is a DecimalInput; commit happens on blur.
    const rateInput = screen.getByDisplayValue("5.00");
    fireEvent.focus(rateInput);
    fireEvent.change(rateInput, { target: { value: "8" } });
    fireEvent.blur(rateInput);

    const patch = lastSavePatch();
    expect(patch?.lineItems?.[0]?.rate).toBe(8);
    // Rendered totals reflect the reducer-applied edit: 10 × 8 = 80.00.
    expect(screen.queryAllByText("$80.00").length).toBeGreaterThan(0);
  });

  it("holds text edits locally until blur, then flushes a save", () => {
    renderBuilder();
    const nameInput = screen.getByDisplayValue("Laminate install");

    // Typing a name is an in-progress text edit — local only, no save yet.
    fireEvent.change(nameInput, { target: { value: "Hardwood install" } });
    expect((nameInput as HTMLInputElement).value).toBe("Hardwood install");
    expect(mutateAsync).not.toHaveBeenCalled();

    // Blur flushes the pending text edit and persists.
    fireEvent.blur(nameInput);
    const patch = lastSavePatch();
    expect(patch?.lineItems?.[0]?.name).toBe("Hardwood install");
  });
});

describe("EstimateBuilderView — remove line item", () => {
  it("removes the row from the view and persists the shrunken list", () => {
    renderBuilder();
    // The remove control is the ✕ button on the row.
    fireEvent.click(screen.getByText("✕"));

    // Row gone → empty-state prompt shows.
    expect(screen.queryByDisplayValue("Laminate install")).toBeNull();
    expect(screen.queryByText(/No line items yet/)).not.toBeNull();

    const patch = lastSavePatch();
    expect(patch?.lineItems).toHaveLength(0);
  });
});

describe("EstimateBuilderView — save affordance / lock state", () => {
  it("auto-saves edits and surfaces a success toast (no manual save button)", async () => {
    renderBuilder();
    fireEvent.click(screen.getByText("+ Add Line Item"));

    // The adapter forwards the reducer's save patch through to the mutation,
    // and reports the result to the user via toast.
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(showToast).toHaveBeenCalledWith("Saved");
  });

  it("disables editing affordances when the estimate is locked (approved)", () => {
    estimateDetail = makeEstimate({ status: "approved" });
    renderBuilder();

    // No add/remove controls, and the name field is disabled in read-only mode.
    expect(screen.queryByText("+ Add Line Item")).toBeNull();
    expect(screen.queryByText("✕")).toBeNull();
    const nameInput = screen.getByDisplayValue(
      "Laminate install"
    ) as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);

    // A locked estimate offers Revise rather than Send.
    expect(screen.queryByText("Send to customer →")).toBeNull();
  });

  it("a dispatch in read-only mode never reaches the save mutation", () => {
    estimateDetail = makeEstimate({ status: "declined" });
    renderBuilder();
    const nameInput = screen.getByDisplayValue("Laminate install");
    fireEvent.change(nameInput, { target: { value: "Tampered" } });
    fireEvent.blur(nameInput);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
