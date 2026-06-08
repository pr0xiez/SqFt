import { describe, expect, it } from "vitest";
import {
  type AgendaEvent,
  buildAgendaSections,
  eventOccursOn,
  formatClock,
  formatFocusLabel,
  formatSectionLabel,
  sectionDates,
  shiftFocus,
  weekDates,
} from "@/lib/schedule/agenda";

function ev(p: Partial<AgendaEvent>): AgendaEvent {
  return {
    id: 1,
    type: "job",
    title: "Job",
    startTime: "08:00",
    endTime: "17:00",
    date: "2026-06-08T00:00:00.000Z",
    endDate: null,
    assignees: [],
    ...p,
  } as AgendaEvent;
}

describe("formatClock", () => {
  it("morning", () => expect(formatClock("08:00")).toBe("8:00a"));
  it("noon", () => expect(formatClock("12:00")).toBe("12:00p"));
  it("afternoon", () => expect(formatClock("13:05")).toBe("1:05p"));
  it("midnight", () => expect(formatClock("00:00")).toBe("12:00a"));
});

describe("eventOccursOn", () => {
  it("single day matches its date", () =>
    expect(eventOccursOn(ev({}), "2026-06-08")).toBe(true));
  it("single day excludes other days", () =>
    expect(eventOccursOn(ev({}), "2026-06-09")).toBe(false));
  it("multi-day spans inclusive range", () => {
    const e = ev({ endDate: "2026-06-10T00:00:00.000Z" });
    expect(eventOccursOn(e, "2026-06-09")).toBe(true);
    expect(eventOccursOn(e, "2026-06-10")).toBe(true);
    expect(eventOccursOn(e, "2026-06-11")).toBe(false);
  });
});

describe("weekDates", () => {
  it("returns Mon..Sun of the focused week", () => {
    expect(weekDates("2026-06-10")).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
  });
});

describe("sectionDates", () => {
  it("day → one date", () =>
    expect(sectionDates("2026-06-08", "day")).toEqual(["2026-06-08"]));
  it("week → seven dates", () =>
    expect(sectionDates("2026-06-08", "week")).toHaveLength(7));
});

describe("shiftFocus", () => {
  it("day forward", () =>
    expect(shiftFocus("2026-06-08", "day", 1)).toBe("2026-06-09"));
  it("day back", () =>
    expect(shiftFocus("2026-06-08", "day", -1)).toBe("2026-06-07"));
  it("week forward", () =>
    expect(shiftFocus("2026-06-08", "week", 1)).toBe("2026-06-15"));
});

describe("formatSectionLabel", () => {
  it("formats weekday and month/day", () =>
    expect(formatSectionLabel("2026-06-08")).toBe("Mon · Jun 8"));
});

describe("formatFocusLabel", () => {
  it("day → the focused weekday and month/day", () =>
    expect(formatFocusLabel("2026-06-08", "day")).toBe("Mon · Jun 8"));
  it("week → the Mon..Sun month/day range", () =>
    expect(formatFocusLabel("2026-06-10", "week")).toBe("Jun 8 – Jun 14"));
  it("week → spans a month boundary", () =>
    expect(formatFocusLabel("2026-06-30", "week")).toBe("Jun 29 – Jul 5"));
});

describe("buildAgendaSections", () => {
  const mine = ev({ id: 1, assignees: [{ id: "u1", name: "Me" }] });
  const theirs = ev({ id: 2, assignees: [{ id: "u2", name: "Other" }] });
  const later = ev({
    id: 3,
    startTime: "06:00",
    assignees: [{ id: "u1", name: "Me" }],
  });

  it("day + mine → one section, only my events, sorted by start", () => {
    const out = buildAgendaSections([mine, theirs, later], {
      focusedDate: "2026-06-08",
      range: "day",
      scope: "mine",
      currentUserId: "u1",
      today: "2026-06-08",
    });
    expect(out).toHaveLength(1);
    expect(out[0].isToday).toBe(true);
    expect(out[0].events.map((e) => e.id)).toEqual([3, 1]); // 06:00 before 08:00
  });

  it("team → includes everyone", () => {
    const out = buildAgendaSections([mine, theirs], {
      focusedDate: "2026-06-08",
      range: "day",
      scope: "team",
      currentUserId: "u1",
      today: "2026-06-09",
    });
    expect(out[0].events).toHaveLength(2);
    expect(out[0].isToday).toBe(false);
  });

  it("week → seven sections", () => {
    const out = buildAgendaSections([mine], {
      focusedDate: "2026-06-08",
      range: "week",
      scope: "mine",
      currentUserId: "u1",
      today: "2026-06-08",
    });
    expect(out).toHaveLength(7);
    expect(out[0].events).toHaveLength(1);
    expect(out[1].events).toHaveLength(0);
  });
});
