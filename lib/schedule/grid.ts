/**
 * Pure geometry for the Schedule Manager week grid: the visible hour range,
 * overlap lane layout, clamping of events that fall outside the 7a–7p window,
 * click-to-time snapping, and the "now" line position. Kept free of React and
 * Prisma so it is unit-testable, mirroring lib/schedule/agenda.ts.
 */

import { timeToMinutes } from "@/lib/utils";

export const START_HOUR = 7;
export const END_HOUR = 19;
export const PX_PER_HOUR = 52;
export const BODY_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR;
export const PX_PER_MIN = PX_PER_HOUR / 60;
export const GRID_HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => i + START_HOUR
);

const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;

/** Smallest chip the grid draws, so short/clamped events stay clickable. */
export const MIN_CHIP_PX = 22;

export interface GridEventTimes {
  startTime: string;
  endTime: string;
}

export interface PlacedEvent<T> {
  ev: T;
  /** px offset of the chip within the day column (already clamped). */
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
  /** The event really starts before / ends after the visible window. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

function clampChip(startMin: number, endMin: number) {
  const clippedStart = startMin < 0;
  const clippedEnd = endMin > TOTAL_MIN;
  const rawTop = startMin * PX_PER_MIN;
  // −2px keeps a visual gap between back-to-back chips.
  const rawBottom = endMin * PX_PER_MIN - 2;
  const top = Math.min(Math.max(rawTop, 0), BODY_HEIGHT - MIN_CHIP_PX);
  const bottom = Math.min(Math.max(rawBottom, top + MIN_CHIP_PX), BODY_HEIGHT);
  return { top, height: bottom - top, clippedStart, clippedEnd };
}

/**
 * Place one day's events into side-by-side lanes wherever they overlap, and
 * clamp each chip into the visible window (an event outside 7a–7p is pinned
 * to the grid edge at minimum size instead of rendering off-grid).
 */
export function layoutDayEvents<T extends GridEventTimes>(
  dayEvents: T[]
): PlacedEvent<T>[] {
  const mapped = dayEvents
    .map((ev) => ({
      ev,
      startMin: timeToMinutes(ev.startTime) - START_HOUR * 60,
      endMin: timeToMinutes(ev.endTime) - START_HOUR * 60,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Group into clusters of transitively-overlapping events.
  const clusters: { items: typeof mapped }[] = [];
  let cur: (typeof clusters)[0] | null = null;
  let curEndMax = Number.NEGATIVE_INFINITY;
  for (const e of mapped) {
    if (cur && e.startMin < curEndMax) {
      cur.items.push(e);
      curEndMax = Math.max(curEndMax, e.endMin);
    } else {
      cur = { items: [e] };
      curEndMax = e.endMin;
      clusters.push(cur);
    }
  }

  const placed: PlacedEvent<T>[] = [];
  for (const cl of clusters) {
    const lanes: number[] = [];
    const assigned: { item: (typeof mapped)[0]; lane: number }[] = [];
    for (const item of cl.items) {
      let lane = lanes.findIndex((end) => end <= item.startMin);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(item.endMin);
      } else {
        lanes[lane] = item.endMin;
      }
      assigned.push({ item, lane });
    }
    for (const { item, lane } of assigned) {
      placed.push({
        ev: item.ev,
        lane,
        totalLanes: lanes.length,
        ...clampChip(item.startMin, item.endMin),
      });
    }
  }
  return placed;
}

/** Format minutes-since-midnight as "HH:MM". */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Convert a click's Y offset within a day column into a half-hour slot with a
 * one-hour default duration, clamped so the slot fits inside the grid.
 */
export function slotFromOffsetY(offsetY: number): {
  startTime: string;
  endTime: string;
} {
  const rawMin = offsetY / PX_PER_MIN;
  const snapped = Math.floor(rawMin / 30) * 30;
  const start = Math.min(Math.max(snapped, 0), TOTAL_MIN - 60);
  return {
    startTime: minutesToTime(START_HOUR * 60 + start),
    endTime: minutesToTime(START_HOUR * 60 + start + 60),
  };
}

/**
 * Top px of the current-time line, or null when `minutesSinceMidnight` falls
 * outside the visible window.
 */
export function nowLineTop(minutesSinceMidnight: number): number | null {
  const rel = minutesSinceMidnight - START_HOUR * 60;
  if (rel < 0 || rel > TOTAL_MIN) return null;
  return rel * PX_PER_MIN;
}
