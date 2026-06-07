// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleView } from "@/components/schedule/CalendarGrid";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

const today = todayStr();

const existingEvent: CalEvent = {
  id: 123,
  orgId: "org1",
  type: "visit",
  title: "Existing Visit",
  customerId: null,
  estimateId: null,
  date: today,
  endDate: null,
  startTime: "09:00",
  endTime: "10:00",
  crewMembers: [],
  notes: null,
  createdAt: today,
  customer: null,
};

// Keep the real mutation hooks (useCreateEvent/useUpdateEvent/useDeleteEvent)
// so we exercise the actual fetch calls; only stub the events query.
vi.mock("@/lib/hooks/useEvents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/hooks/useEvents")>();
  return { ...actual, useEvents: () => ({ data: [existingEvent] }) };
});
vi.mock("@/lib/hooks/useCustomers", () => ({
  useCustomers: () => ({ data: { items: [] } }),
}));
vi.mock("@/lib/hooks/useEstimates", () => ({
  useEstimates: () => ({ data: { items: [] } }),
}));
vi.mock("@/lib/hooks/useCrewMembers", () => ({
  useCrewMembers: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("ScheduleView editing", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates an existing event via PATCH instead of creating a duplicate", async () => {
    render(wrap(<ScheduleView canEdit />));

    // Open the existing event for editing.
    fireEvent.click(await screen.findByText("Existing Visit"));

    // The panel should show the Update action for an existing event.
    fireEvent.click(await screen.findByRole("button", { name: "Update" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];

    // It must NOT POST a brand-new event (that is the duplicate bug).
    const createdDuplicate = calls.some(
      ([url, opts]) => url === "/api/events" && opts?.method === "POST"
    );
    expect(createdDuplicate).toBe(false);

    // It MUST PATCH the existing event in place.
    const patchedExisting = calls.some(
      ([url, opts]) => url === "/api/events/123" && opts?.method === "PATCH"
    );
    expect(patchedExisting).toBe(true);
  });
});
