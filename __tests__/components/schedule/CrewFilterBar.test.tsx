// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrewFilterBar } from "@/components/schedule/CrewFilterBar";

const crew = [
  { id: 10, name: "Carlos", role: "Lead Installer" },
  { id: 11, name: "Dave", role: "Installer" },
];
const events = [
  { id: 1, date: "2026-05-04", crewMembers: [crew[0]] },
  { id: 2, date: "2026-05-05", crewMembers: [crew[0], crew[1]] },
];

describe("CrewFilterBar", () => {
  it("renders an 'All' chip + one chip per crew member", () => {
    render(
      <CrewFilterBar
        crew={crew}
        events={events}
        weekStart="2026-05-04"
        days={7}
        active="all"
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/^All$/)).toBeTruthy();
    expect(screen.getByText("Carlos")).toBeTruthy();
    expect(screen.getByText("Dave")).toBeTruthy();
  });

  it("shows correct counts in the visible week", () => {
    render(
      <CrewFilterBar
        crew={crew}
        events={events}
        weekStart="2026-05-04"
        days={7}
        active="all"
        onChange={() => {}}
      />
    );
    const meta = screen.getByText(/Showing/i).textContent ?? "";
    expect(meta).toMatch(/all crews/i);
    expect(meta).toMatch(/2 events/i);
  });

  it("calls onChange when a crew chip is clicked", () => {
    const onChange = vi.fn();
    render(
      <CrewFilterBar
        crew={crew}
        events={events}
        weekStart="2026-05-04"
        days={7}
        active="all"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("Carlos"));
    expect(onChange).toHaveBeenCalledWith(10);
  });
});
