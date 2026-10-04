// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventFormPanel } from "@/components/schedule/EventFormPanel";
import type { CalEvent } from "@/lib/hooks/useEvents";

const useCustomers = vi.fn();
const useEstimates = vi.fn();
vi.mock("@/lib/hooks/useCustomers", () => ({
  useCustomers: (...a: unknown[]) => useCustomers(...a),
}));
vi.mock("@/lib/hooks/useEstimates", () => ({
  useEstimates: (...a: unknown[]) => useEstimates(...a),
}));
vi.mock("@/lib/hooks/useAssignableUsers", () => ({
  useAssignableUsers: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/useDebouncedValue", () => ({
  useDebouncedValue: <T,>(v: T) => v,
}));

const editEvent: CalEvent = {
  id: 1,
  orgId: "org1",
  type: "job",
  title: "Old job",
  customerId: 900,
  estimateId: 4000,
  date: "2026-05-01",
  endDate: null,
  startTime: "08:00",
  endTime: "09:00",
  assignees: [],
  createdAt: "2026-05-01",
  customer: { id: 900, name: "Zed Ancient" },
  estimateNumber: 1234,
};

function renderPanel(editingEvent: CalEvent | null = null, open = true) {
  return render(
    <EventFormPanel
      open={open}
      onClose={() => {}}
      defaultDate="2026-05-01"
      editingEvent={editingEvent}
      onSave={async () => {}}
      onDelete={async () => {}}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useCustomers.mockReturnValue({ data: { items: [], total: 0 } });
  useEstimates.mockReturnValue({ data: { items: [], total: 0 } });
});

describe("EventFormPanel pickers", () => {
  it("warns when more customers exist than the page shows", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `Cust ${i + 1}`,
    }));
    useCustomers.mockReturnValue({ data: { items, total: 130 } });
    renderPanel();
    expect(screen.getByText(/first 50 of 130/)).toBeTruthy();
  });

  it("searches customers server-side via q", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Search customers"), {
      target: { value: "zed" },
    });
    const last = useCustomers.mock.calls.at(-1);
    expect(last?.[0]).toMatchObject({ q: "zed" });
  });

  it("shows labels for an edited event outside the fetched window", () => {
    renderPanel(editEvent);
    const customer = screen.getByLabelText("Customer") as HTMLSelectElement;
    expect(customer.value).toBe("900");
    expect(customer.selectedOptions[0].textContent).toBe("Zed Ancient");
    const estimate = screen.getByLabelText("Estimate") as HTMLSelectElement;
    expect(estimate.value).toBe("4000");
    expect(estimate.selectedOptions[0].textContent).toBe("Estimate #1234");
  });

  it("does not fetch while the panel is closed", () => {
    renderPanel(null, false);
    expect(useCustomers.mock.calls.every((c) => c[1]?.enabled === false)).toBe(
      true
    );
    expect(useEstimates.mock.calls.every((c) => c[1]?.enabled === false)).toBe(
      true
    );
  });

  it("scopes the estimate query to the selected customer", () => {
    renderPanel(editEvent);
    expect(useEstimates.mock.calls.at(-1)?.[0]).toMatchObject({
      customerId: 900,
    });
  });
});
