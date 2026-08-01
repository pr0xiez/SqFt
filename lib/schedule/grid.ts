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
 * Clamp one day's events into the visible window (an event outside 7a–7p is
 * pinned to the grid edge at minimum size instead of rendering off-grid), then
 * place them into side-by-side lanes wherever the *clamped* chips overlap — so
 * no chip can ever be drawn on top of another.
 */
export function layoutDayEvents<T extends GridEventTimes>(
  dayEvents: T[]
): PlacedEvent<T>[] {
  // Clamp FIRST, then lane events by their *drawn* rect. Clamping collapses
  // everything outside 7a–7p onto the same edge geometry, so laning by the raw
  // times would leave two out-of-range events (e.g. 05:00–05:30 and
  // 06:00–06:30, which don't overlap in clock time) sharing one full-width
  // lane at top 0 — the upper chip invisible and unclickable.
  const mapped = dayEvents
    .map((ev) => {
      const chip = clampChip(
        timeToMinutes(ev.startTime) - START_HOUR * 60,
        timeToMinutes(ev.endTime) - START_HOUR * 60
      );
      return { ev, ...chip, bottom: chip.top + chip.height };
    })
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom);

  // Group into clusters of transitively-overlapping chips.
  const clusters: { items: typeof mapped }[] = [];
  let cur: (typeof clusters)[0] | null = null;
  let curBottomMax = Number.NEGATIVE_INFINITY;
  for (const e of mapped) {
    if (cur && e.top < curBottomMax) {
      cur.items.push(e);
      curBottomMax = Math.max(curBottomMax, e.bottom);
    } else {
      cur = { items: [e] };
      curBottomMax = e.bottom;
      clusters.push(cur);
    }
  }

  const placed: PlacedEvent<T>[] = [];
  for (const cl of clusters) {
    const lanes: number[] = [];
    const assigned: { item: (typeof mapped)[0]; lane: number }[] = [];
    for (const item of cl.items) {
      let lane = lanes.findIndex((bottom) => bottom <= item.top);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(item.bottom);
      } else {
        lanes[lane] = item.bottom;
      }
      assigned.push({ item, lane });
    }
    for (const { item, lane } of assigned) {
      placed.push({
        ev: item.ev,
        top: item.top,
        height: item.height,
        lane,
        totalLanes: lanes.length,
        clippedStart: item.clippedStart,
        clippedEnd: item.clippedEnd,
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
