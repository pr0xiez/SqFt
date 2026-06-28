// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const showToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/useEstimates", () => ({
  useCreateEstimate: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/lib/hooks/useSiteMeasures", () => ({
  useSiteMeasures: () => ({
    data: {
      items: [
        {
          id: 11,
          siteMeasureNumber: 1042,
          location: {
            address: "142 Maple Dr",
            customer: { id: 1, name: "Henderson, J." },
          },
          _count: { items: 3, estimates: 0 },
        },
      ],
    },
    isFetching: false,
  }),
}));

vi.mock("@/lib/hooks/useInvoiceableEstimates", () => ({
  useInvoiceableEstimates: () => ({
    data: {
      defaultDepositPct: 0.3,
      items: [
        {
          id: 5001,
          estimateNumber: 5001,
          status: "approved",
          customerName: "Henderson, J.",
          address: "142 Maple Dr",
          total: 5210.4,
          unbilled: 5210.4,
        },
      ],
    },
    isFetching: false,
  }),
}));

import { QuickEstimatePanel } from "@/components/quick-create/QuickEstimatePanel";
import { QuickInvoicePanel } from "@/components/quick-create/QuickInvoicePanel";

beforeEach(() => {
  push.mockReset();
  showToast.mockReset();
  mutateAsync.mockReset();
});

describe("QuickEstimatePanel", () => {
  it("disables Create until a site measure is selected", () => {
    render(<QuickEstimatePanel onClose={() => {}} />);
    const create = screen.getByRole("button", { name: /Create estimate/ });
    expect((create as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates the estimate from the picked site measure and opens its builder", async () => {
    mutateAsync.mockResolvedValue({ id: 77 });
    const onClose = vi.fn();
    render(<QuickEstimatePanel onClose={onClose} />);

    fireEvent.click(screen.getByText(/1042/));
    const create = screen.getByRole("button", { name: /Create estimate/ });
    expect((create as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(create);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ siteMeasureId: 11 })
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/estimates/77"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("QuickInvoicePanel", () => {
  it("hands the picked billable estimate to the invoice dialog with its balance", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<QuickInvoicePanel onClose={onClose} onPick={onPick} />);

    fireEvent.click(screen.getByText(/5001/));
    fireEvent.click(screen.getByRole("button", { name: /Create invoice/ }));

    expect(onPick).toHaveBeenCalledWith({
      estimateId: 5001,
      unbilled: 5210.4,
      defaultDepositPct: 0.3,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
