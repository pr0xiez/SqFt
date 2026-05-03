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

export interface LShapeSection {
  w: string | number;
  l: string | number;
}

export interface LShapeDeduction {
  w: string | number;
  l: string | number;
  label?: string;
}

export interface LShapeData {
  sections: LShapeSection[];
  deductions: LShapeDeduction[];
}

export interface RoomItem {
  id: number;
  type: "room" | "note";
  shape?: "rect" | "tri" | "lshape" | null;
  w?: string | number | null;
  l?: string | number | null;
  lshapeData?: LShapeData | null;
  name?: string | null;
  note?: string | null;
  text?: string | null;
}

/** Calculate net square footage for an L-shape room */
export function lshapeNet(data: LShapeData | null | undefined): number {
  if (!data) return 0;
  const sectionTotal = (data.sections || []).reduce((sum, s) => {
    const w = parsef(s.w);
    const l = parsef(s.l);
    return sum + (w !== null && l !== null ? w * l : 0);
  }, 0);
  const deductTotal = (data.deductions || []).reduce((sum, d) => {
    const w = parsef(d.w);
    const l = parsef(d.l);
    return sum + (w !== null && l !== null ? w * l : 0);
  }, 0);
  return Math.max(0, sectionTotal - deductTotal);
}

/** Calculate net square footage for a single room item */
export function roomSqft(room: RoomItem): number {
  if (room.type !== "room") return 0;
  const shape = room.shape || "rect";
  if (shape === "lshape") {
    return lshapeNet(room.lshapeData as LShapeData | null);
  }
  const w = parsef(room.w);
  const l = parsef(room.l);
  if (w === null || l === null) return 0;
  if (shape === "tri") return (w * l) / 2;
  return w * l; // rect
}

/** Sum square footage of all room items in an estimate */
export function estTotalArea(items: RoomItem[]): number {
  return items
    .filter((item) => item.type === "room")
    .reduce((sum, room) => sum + roomSqft(room), 0);
}

// ── Quote calculations ────────────────────────────────────────────────────

export interface LineItemCalc {
  id: number;
  name: string;
  rate: number;
  qtyMode: "manual" | "linked";
  qty?: number | null;
  wastePct: number;
  unitLabel: string;
  linkedRoomIds: number[];
  sortOrder?: number;
}

/** Get effective quantity for a line item, resolving linked room sq footage */
export function getEffectiveQty(
  li: LineItemCalc,
  rooms: RoomItem[]
): number | null {
  if (li.qtyMode === "linked") {
    const linked = rooms.filter(
      (r) => r.type === "room" && li.linkedRoomIds.includes(r.id)
    );
    if (linked.length === 0) return null;
    const base = linked.reduce((sum, r) => sum + roomSqft(r), 0);
    return base * (1 + (li.wastePct || 0) / 100);
  }
  return li.qty ?? null;
}

/** Calculate the subtotal for a single line item */
export function liSubtotal(li: LineItemCalc, rooms: RoomItem[]): number | null {
  const qty = getEffectiveQty(li, rooms);
  if (qty === null) return null;
  return qty * li.rate;
}

// ── Date helpers ──────────────────────────────────────────────────────────

/** Get today's date as YYYY-MM-DD string */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
  return date.toISOString().slice(0, 10);
}

/** Format a Date as "Mon 5" for calendar headers */
export function fmtDayHead(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
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
