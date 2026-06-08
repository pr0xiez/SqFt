// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { MyScheduleView } from "@/components/schedule/MyScheduleView";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

const today = todayStr();

const mine: CalEvent = {
  id: 1,
  orgId: "o1",
  type: "job",
  title: "My Carpet Job",
  customerId: 3,
  estimateId: 9,
  estimateNumber: 1042,
  date: `${today}T00:00:00.000Z`,
  endDate: null,
  startTime: "08:00",
  endTime: "11:00",
  assignees: [{ id: "u1", name: "Me" }],
  notes: null,
  createdAt: today,
  customer: { id: 3, name: "Johnson", phone: "2175550148" },
  address: "412 Oak St",
};
const theirs: CalEvent = {
  ...mine,
  id: 2,
  title: "Other's Job",
  assignees: [{ id: "u2", name: "Other" }],
  customer: { id: 4, name: "Alvarez", phone: null },
  address: null,
};

vi.mock("@/lib/hooks/useEvents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/hooks/useEvents")>();
  return { ...actual, useEvents: () => ({ data: [mine, theirs] }) };
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("MyScheduleView", () => {
  it("defaults to My + Day + today and shows only my events", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    await waitFor(() =>
      expect(screen.getByText("My Carpet Job")).toBeInTheDocument()
    );
    expect(screen.queryByText("Other's Job")).not.toBeInTheDocument();
  });

  it("Team scope reveals everyone's events", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    await waitFor(() => screen.getByText("My Carpet Job"));
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(await screen.findByText("Other's Job")).toBeInTheDocument();
  });

  it("tapping an event opens the job card", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    await waitFor(() => screen.getByText("My Carpet Job"));
    fireEvent.click(screen.getByText("My Carpet Job"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view estimate/i })
    ).toBeInTheDocument();
  });

  it("exposes a labelled today button that flips to a return CTA after navigating", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    const todayBtn = await screen.findByRole("button", {
      name: /jump to today/i,
    });
    // On today: resting state, reads "Today".
    expect(todayBtn).toHaveAttribute("aria-pressed", "true");
    expect(todayBtn).toHaveTextContent("Today");

    // Navigate away → the same button becomes a "Back to today" CTA.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(todayBtn).toHaveAttribute("aria-pressed", "false");
    expect(todayBtn).toHaveTextContent(/back to today/i);

    // Tapping it returns to today.
    fireEvent.click(todayBtn);
    expect(todayBtn).toHaveAttribute("aria-pressed", "true");
  });
});
