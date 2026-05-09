import { describe, expect, it } from "vitest";
import {
  eventMatchesCrew,
  type EventForCrew,
  weekCrewCounts,
} from "@/components/schedule/crewFilters";

const events: EventForCrew[] = [
  {
    id: 1,
    date: "2026-05-04",
    crewMembers: [{ id: 10, name: "Carlos", role: "" }],
  },
  {
    id: 2,
    date: "2026-05-05",
    crewMembers: [
      { id: 10, name: "Carlos", role: "" },
      { id: 11, name: "Dave", role: "" },
    ],
  },
  { id: 3, date: "2026-05-05", crewMembers: [] },
  {
    id: 4,
    date: "2026-05-12",
    crewMembers: [{ id: 10, name: "Carlos", role: "" }],
  },
];

describe("eventMatchesCrew", () => {
  it("'all' matches every event", () => {
    expect(events.every((e) => eventMatchesCrew(e, "all"))).toBe(true);
  });
  it("a numeric filter matches when the crew is on the event", () => {
    expect(eventMatchesCrew(events[0], 10)).toBe(true);
    expect(eventMatchesCrew(events[1], 11)).toBe(true);
  });
  it("does not match when the crew is not on the event", () => {
    expect(eventMatchesCrew(events[0], 11)).toBe(false);
  });
  it("never matches an event with no crew when a specific filter is active", () => {
    expect(eventMatchesCrew(events[2], 10)).toBe(false);
  });
});

describe("weekCrewCounts", () => {
  const weekStart = "2026-05-04";
  it("counts events per crewMember within the visible week", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get(10)).toBe(2);
    expect(counts.get(11)).toBe(1);
  });
  it("returns total across all events in the week as the 'all' bucket", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get("all")).toBe(3);
  });
});
