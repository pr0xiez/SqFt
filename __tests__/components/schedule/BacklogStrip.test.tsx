// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BacklogStrip, waitingDays } from "@/components/schedule/BacklogStrip";
import type { SchedulableCandidate } from "@/lib/schedule/backlog";

const candidate: SchedulableCandidate = {
  id: 77,
  estimateNumber: 5006,
  customerId: 5,
  customerName: "Henderson",
  address: "12 Oak Ln",
  total: 3095.5,
  approvedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
};

describe("BacklogStrip", () => {
  it("renders nothing when the backlog is empty", () => {
    const { container } = render(
      <BacklogStrip candidates={[]} onSchedule={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders candidate cards and calls onSchedule on click", () => {
    const onSchedule = vi.fn();
    render(<BacklogStrip candidates={[candidate]} onSchedule={onSchedule} />);

    expect(screen.getByText("Unscheduled jobs")).toBeTruthy();
    expect(screen.getByText("#5006")).toBeTruthy();
    expect(screen.getByText("12 Oak Ln")).toBeTruthy();
    expect(screen.getByText("waiting 8d")).toBeTruthy();

    fireEvent.click(screen.getByText("Henderson"));
    expect(onSchedule).toHaveBeenCalledWith(candidate);
  });

  it("collapses and expands the card row", () => {
    render(<BacklogStrip candidates={[candidate]} onSchedule={vi.fn()} />);

    fireEvent.click(screen.getByText("Unscheduled jobs"));
    expect(screen.queryByText("#5006")).toBeNull();

    fireEvent.click(screen.getByText("Unscheduled jobs"));
    expect(screen.getByText("#5006")).toBeTruthy();
  });
});

describe("waitingDays", () => {
  it("returns whole days since approval", () => {
    const now = Date.parse("2026-07-09T12:00:00Z");
    expect(waitingDays("2026-07-01T12:00:00Z", now)).toBe(8);
    expect(waitingDays("2026-07-09T06:00:00Z", now)).toBe(0);
  });

  it("is null for missing or invalid timestamps", () => {
    expect(waitingDays(null, Date.now())).toBeNull();
    expect(waitingDays("not-a-date", Date.now())).toBeNull();
  });

  it("never returns negative days (clock skew)", () => {
    const now = Date.parse("2026-07-09T12:00:00Z");
    expect(waitingDays("2026-07-10T12:00:00Z", now)).toBe(0);
  });
});
