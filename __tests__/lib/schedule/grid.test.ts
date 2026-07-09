import { describe, expect, it } from "vitest";
import {
  BODY_HEIGHT,
  layoutDayEvents,
  MIN_CHIP_PX,
  minutesToTime,
  nowLineTop,
  PX_PER_MIN,
  slotFromOffsetY,
} from "@/lib/schedule/grid";

function ev(startTime: string, endTime: string) {
  return { startTime, endTime };
}

describe("layoutDayEvents", () => {
  it("places non-overlapping events in a single full-width lane", () => {
    const placed = layoutDayEvents([
      ev("09:00", "10:00"),
      ev("11:00", "12:00"),
    ]);
    expect(placed).toHaveLength(2);
    for (const p of placed) {
      expect(p.lane).toBe(0);
      expect(p.totalLanes).toBe(1);
    }
  });

  it("splits overlapping events into side-by-side lanes", () => {
    const placed = layoutDayEvents([
      ev("09:00", "11:00"),
      ev("10:00", "12:00"),
    ]);
    expect(placed.map((p) => p.lane).sort()).toEqual([0, 1]);
    for (const p of placed) expect(p.totalLanes).toBe(2);
  });

  it("computes in-window geometry (top from start, height from duration)", () => {
    const [p] = layoutDayEvents([ev("09:00", "10:00")]);
    expect(p.top).toBeCloseTo(120 * PX_PER_MIN); // 2h after 7a
    expect(p.height).toBeCloseTo(60 * PX_PER_MIN - 2); // 1h minus chip gap
    expect(p.clippedStart).toBe(false);
    expect(p.clippedEnd).toBe(false);
  });

  it("pins an event entirely before 7a to the top edge at minimum size", () => {
    const [p] = layoutDayEvents([ev("05:00", "06:00")]);
    expect(p.top).toBe(0);
    expect(p.height).toBe(MIN_CHIP_PX);
    expect(p.clippedStart).toBe(true);
    expect(p.clippedEnd).toBe(false);
  });

  it("pins an event entirely after 7p to the bottom edge at minimum size", () => {
    const [p] = layoutDayEvents([ev("20:00", "21:00")]);
    expect(p.top).toBe(BODY_HEIGHT - MIN_CHIP_PX);
    expect(p.top + p.height).toBe(BODY_HEIGHT);
    expect(p.clippedStart).toBe(false);
    expect(p.clippedEnd).toBe(true);
  });

  it("clamps an event spanning the whole window to the full column", () => {
    const [p] = layoutDayEvents([ev("06:00", "20:00")]);
    expect(p.top).toBe(0);
    expect(p.top + p.height).toBe(BODY_HEIGHT);
    expect(p.clippedStart).toBe(true);
    expect(p.clippedEnd).toBe(true);
  });

  it("truncates an event that runs past 7p at the bottom edge", () => {
    const [p] = layoutDayEvents([ev("18:00", "20:00")]);
    expect(p.top).toBeCloseTo(11 * 60 * PX_PER_MIN);
    expect(p.top + p.height).toBe(BODY_HEIGHT);
    expect(p.clippedEnd).toBe(true);
  });

  it("gives zero/negative-duration events the minimum chip height", () => {
    const [p] = layoutDayEvents([ev("09:00", "09:00")]);
    expect(p.height).toBe(MIN_CHIP_PX);
  });
});

describe("slotFromOffsetY", () => {
  it("snaps a click down to the half-hour with a one-hour duration", () => {
    // 9:15a is 135 min after 7a.
    const slot = slotFromOffsetY(135 * PX_PER_MIN);
    expect(slot).toEqual({ startTime: "09:00", endTime: "10:00" });
  });

  it("snaps the second half of an hour to the half-hour", () => {
    const slot = slotFromOffsetY(155 * PX_PER_MIN); // 9:35a
    expect(slot).toEqual({ startTime: "09:30", endTime: "10:30" });
  });

  it("clamps clicks above the grid to the first slot", () => {
    expect(slotFromOffsetY(-10)).toEqual({
      startTime: "07:00",
      endTime: "08:00",
    });
  });

  it("keeps the default hour inside the grid near the bottom", () => {
    expect(slotFromOffsetY(BODY_HEIGHT)).toEqual({
      startTime: "18:00",
      endTime: "19:00",
    });
  });
});

describe("nowLineTop", () => {
  it("positions the line inside the window", () => {
    expect(nowLineTop(12 * 60)).toBeCloseTo(5 * 60 * PX_PER_MIN);
  });

  it("returns 0 exactly at 7a", () => {
    expect(nowLineTop(7 * 60)).toBe(0);
  });

  it("hides the line outside the window", () => {
    expect(nowLineTop(6 * 60)).toBeNull();
    expect(nowLineTop(20 * 60)).toBeNull();
  });
});

describe("minutesToTime", () => {
  it("zero-pads hours and minutes", () => {
    expect(minutesToTime(7 * 60 + 5)).toBe("07:05");
    expect(minutesToTime(18 * 60 + 30)).toBe("18:30");
  });
});
