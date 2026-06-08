// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventCard } from "@/components/schedule/EventCard";
import type { CalEvent } from "@/lib/hooks/useEvents";

const base: CalEvent = {
  id: 7,
  orgId: "o1",
  type: "job",
  title: "Carpet — hall & stairs",
  customerId: 3,
  estimateId: 9,
  estimateNumber: 1042,
  date: "2026-06-08T00:00:00.000Z",
  endDate: null,
  startTime: "08:00",
  endTime: "11:00",
  assignees: [{ id: "u1", name: "Jordan" }],
  notes: null,
  createdAt: "2026-06-08T00:00:00.000Z",
  customer: { id: 3, name: "Johnson Residence", phone: "2175550148" },
  address: "412 Oak St",
};

describe("EventCard", () => {
  it("shows time, title, customer, address and crew initial", () => {
    render(<EventCard event={base} onOpen={() => {}} />);
    expect(screen.getByText("8:00a")).toBeInTheDocument();
    expect(screen.getByText("Carpet — hall & stairs")).toBeInTheDocument();
    expect(screen.getByText("Johnson Residence")).toBeInTheDocument();
    expect(screen.getByText("412 Oak St")).toBeInTheDocument();
    expect(screen.getByText("J")).toBeInTheDocument(); // CrewAvatar initial
  });

  it("calls onOpen when tapped", () => {
    const onOpen = vi.fn();
    render(<EventCard event={base} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("omits the address row when none is derivable", () => {
    render(<EventCard event={{ ...base, address: null }} onOpen={() => {}} />);
    expect(screen.queryByText("412 Oak St")).not.toBeInTheDocument();
  });
});
