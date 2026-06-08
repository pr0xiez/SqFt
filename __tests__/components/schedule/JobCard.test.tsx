// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobCard } from "@/components/schedule/JobCard";
import type { CalEvent } from "@/lib/hooks/useEvents";

const event: CalEvent = {
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
  notes: "Gate code #4412",
  createdAt: "2026-06-08T00:00:00.000Z",
  customer: { id: 3, name: "Johnson Residence", phone: "2175550148" },
  address: "412 Oak St",
};

describe("JobCard", () => {
  it("renders nothing when event is null", () => {
    const { container } = render(<JobCard event={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows details and actionable links", () => {
    render(<JobCard event={event} onClose={() => {}} />);
    expect(screen.getByText("Carpet — hall & stairs")).toBeInTheDocument();
    expect(screen.getByText("Johnson Residence")).toBeInTheDocument();
    expect(screen.getByText("Gate code #4412")).toBeInTheDocument();

    const phone = screen.getByRole("link", { name: /call/i });
    expect(phone).toHaveAttribute("href", "tel:2175550148");

    const directions = screen.getByRole("link", { name: /directions/i });
    expect(directions).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=412%20Oak%20St"
    );

    expect(
      screen.getByRole("link", { name: /view customer/i })
    ).toHaveAttribute("href", "/customers/3");
    expect(
      screen.getByRole("link", { name: /view estimate/i })
    ).toHaveAttribute("href", "/estimates/9");
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(<JobCard event={event} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
