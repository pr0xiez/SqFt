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
  assignees: [],
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
vi.mock("@/lib/hooks/useAssignableUsers", () => ({
  useAssignableUsers: () => ({ data: [] }),
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

const backlogCandidate = {
  id: 77,
  estimateNumber: 5006,
  customerId: 5,
  customerName: "Henderson",
  address: "12 Oak Ln",
  total: 3095.5,
  approvedAt: "2026-05-02T10:45:00.000Z",
};

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

describe("ScheduleView unscheduled backlog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) =>
      url === "/api/estimates/schedulable"
        ? { ok: true, json: async () => [backlogCandidate] }
        : { ok: true, json: async () => ({}) }
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("schedules a backlog estimate via a pre-filled job form", async () => {
    render(wrap(<ScheduleView canEdit />));

    // The approved-but-unscheduled estimate shows in the backlog strip.
    // (Query by the card's estimate number — the customer name also appears
    // as a merged <option> in the always-mounted form's customer select.)
    fireEvent.click(await screen.findByRole("button", { name: /#5006/ }));

    // The event form opens pre-filled: job type, seeded title, the backlog
    // estimate selected (merged into the options despite the picker fetch
    // returning nothing).
    const title = screen.getByDisplayValue("Install: Henderson");
    expect(title).toBeTruthy();
    expect(screen.getByDisplayValue("Estimate #5006")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];
      const post = calls.find(
        ([url, opts]) => url === "/api/events" && opts?.method === "POST"
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.[1]?.body));
      expect(body.type).toBe("job");
      expect(body.estimateId).toBe(77);
      expect(body.customerId).toBe(5);
    });
  });
});
