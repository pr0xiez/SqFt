import { describe, expect, it } from "vitest";
import {
  type EventForCrew,
  eventMatchesCrew,
  weekCrewCounts,
} from "@/components/schedule/crewFilters";

const events: EventForCrew[] = [
  { id: 1, date: "2026-05-04", assignees: [{ id: "u10", name: "Carlos" }] },
  {
    id: 2,
    date: "2026-05-05",
    assignees: [
      { id: "u10", name: "Carlos" },
      { id: "u11", name: "Dave" },
    ],
  },
  { id: 3, date: "2026-05-05", assignees: [] },
  { id: 4, date: "2026-05-12", assignees: [{ id: "u10", name: "Carlos" }] },
];

describe("eventMatchesCrew", () => {
  it("'all' matches every event", () => {
    expect(events.every((e) => eventMatchesCrew(e, "all"))).toBe(true);
  });
  it("an id filter matches when the assignee is on the event", () => {
    expect(eventMatchesCrew(events[0], "u10")).toBe(true);
    expect(eventMatchesCrew(events[1], "u11")).toBe(true);
  });
  it("does not match when the assignee is not on the event", () => {
    expect(eventMatchesCrew(events[0], "u11")).toBe(false);
  });
  it("never matches an event with no assignees when a specific filter is active", () => {
    expect(eventMatchesCrew(events[2], "u10")).toBe(false);
  });
});

describe("weekCrewCounts", () => {
  const weekStart = "2026-05-04";
  it("counts events per assignee within the visible week", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get("u10")).toBe(2);
    expect(counts.get("u11")).toBe(1);
  });
  it("returns total across all events in the week as the 'all' bucket", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get("all")).toBe(3);
  });
});
