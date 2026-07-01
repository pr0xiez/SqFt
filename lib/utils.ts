/**
 * Utility functions ported directly from flooring-prototype-v0_8.html.
 * These are pure functions with no side effects — safe to call on client or server.
 */

// ── Number helpers ────────────────────────────────────────────────────────

/** Parse a float from string input; returns null if invalid/empty */
export function parsef(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

/** Format a large number as a compact currency string (e.g. 4250 → "$4,250") */
export function fmtBig(n: number): string {
  if (n === null || n === undefined) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Format a number as a currency string with cents (e.g. 42.5 → "$42.50") */
export function fmtDollar(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${n.toFixed(2)}`;
}

/** Deep copy an object via JSON serialization */
export function deepCopy<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// ── Room area calculations ────────────────────────────────────────────────

export interface RoomSegment {
  w?: number | null;
  l?: number | null;
}

export interface RoomItem {
  id: number;
  type: "room" | "note";
  shape?: "rect" | "tri" | null;
  w?: string | number | null;
  l?: string | number | null;
  /** Box decomposition of a (possibly non-rectangular) room; sqft = Σ w*l.
   *  Absent/empty means a single legacy box described by the scalar w/l. */
  segments?: RoomSegment[] | null;
  name?: string | null;
  note?: string | null;
  text?: string | null;
}

/** The boxes making up a room: its segments if present, else the single legacy
 *  box from w/l. Use for display and box-count; roomSqft/roomPerimeter remain
 *  the authoritative area/length. */
export function roomSegments(room: RoomItem): RoomSegment[] {
  if (room.segments && room.segments.length > 0) return room.segments;
  return [{ w: parsef(room.w), l: parsef(room.l) }];
}

/** Net square footage for a single room: the sum of its box areas (a legacy
 *  room without segments is treated as one box from w/l). */
export function roomSqft(room: RoomItem): number {
  if (room.type !== "room") return 0;
  return roomSegments(room).reduce((sum, s) => {
    const w = parsef(s.w);
    const l = parsef(s.l);
    return w === null || l === null ? sum : sum + w * l;
  }, 0);
}

/** Perimeter (linear feet) of a room: the sum of each box's 2(w+l). Multi-box
 *  rooms over-count shared interior edges (positions aren't stored), which errs
 *  toward ordering enough trim. Drives linear measures like shoe mold,
 *  quarter-round, transition strips. */
export function roomPerimeter(room: RoomItem): number {
  if (room.type !== "room") return 0;
  return roomSegments(room).reduce((sum, s) => {
    const w = parsef(s.w);
    const l = parsef(s.l);
    return w === null || l === null ? sum : sum + 2 * (w + l);
  }, 0);
}

/** Sum square footage of all room items in an siteMeasure */
export function estTotalArea(items: RoomItem[]): number {
  return items
    .filter((item) => item.type === "room")
    .reduce((sum, room) => sum + roomSqft(room), 0);
}

// ── Estimate calculations ────────────────────────────────────────────────────

/** Source of truth for LineItem.qtyMode string values. Persisted as plain
 *  strings in the DB and over the wire, so renaming a value requires a data
 *  migration. Use the constants (e.g. `QtyMode.LinkedArea`) instead of bare
 *  string literals everywhere. */
export const QtyMode = {
  /** User enters the quantity by hand. */
  Manual: "manual",
  /** Quantity = sum of linked room areas (sqft), × (1 + waste%). */
  LinkedArea: "linked_area",
  /** Quantity = sum of linked room perimeters (lf), × (1 + waste%).
   *  For shoe mold, quarter-round, transition strips. */
  LinkedPerimeter: "linked_perimeter",
} as const;

export type QtyMode = (typeof QtyMode)[keyof typeof QtyMode];

/** All valid `qtyMode` values — used by zod and any other enum consumer. */
export const QTY_MODE_VALUES = Object.values(QtyMode) as [
  QtyMode,
  ...QtyMode[],
];

export interface LineItemCalc {
  id: number;
  name: string;
  description?: string | null;
  rate: number;
  qtyMode: QtyMode;
  qty?: number | null;
  wastePct: number;
  unitLabel: string;
  linkedRoomIds: number[];
  sortOrder?: number;
}

/** True iff the qty mode pulls its quantity from linked rooms (vs. manual). */
export function isLinkedQtyMode(mode: QtyMode): boolean {
  return mode === QtyMode.LinkedArea || mode === QtyMode.LinkedPerimeter;
}

/** Narrow a raw DB string to a known QtyMode, falling back to Manual for
 *  unrecognized legacy values. Use at trust boundaries (DB rows, JSON input). */
export function parseQtyMode(raw: string): QtyMode {
  return (QTY_MODE_VALUES as readonly string[]).includes(raw)
    ? (raw as QtyMode)
    : QtyMode.Manual;
}

// ── Date helpers ──────────────────────────────────────────────────────────

/** Get today's date as YYYY-MM-DD string */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Get a greeting based on the current hour */
export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Get Monday of the week containing the given date */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Add N days to a date, returning a new Date */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Format a Date as YYYY-MM-DD */
export function dateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Format a Date as "Mon 5" for calendar headers */
export function fmtDayHead(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

/** "Mar 3, 2026" — short, human date. Returns "—" for null/undefined. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Convert "08:30" to minutes since midnight (510) */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ── Source label helper ───────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  phone: "Phone",
  online: "Online",
  referral: "Referral",
  walkin: "Walk-in",
  website: "Website",
};

export function sourceName(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
