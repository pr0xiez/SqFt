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

export interface RoomItem {
  id: number;
  type: "room" | "note";
  shape?: "rect" | "tri" | null;
  w?: string | number | null;
  l?: string | number | null;
  name?: string | null;
  note?: string | null;
  text?: string | null;
}

/** Calculate net square footage for a single room item */
export function roomSqft(room: RoomItem): number {
  if (room.type !== "room") return 0;
  const w = parsef(room.w);
  const l = parsef(room.l);
  if (w === null || l === null) return 0;
  if ((room.shape || "rect") === "tri") return (w * l) / 2;
  return w * l;
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

/** Compute the total for an estimate from its line items. Returns null when no line items exist. */
export function computeEstimateTotal(est: {
  lineItems?: LineItemCalc[];
  items?: RoomItem[];
  markupPct: number;
  convenienceFeeRate: number;
}): string | null {
  if (!est.lineItems?.length) return null;
  const rooms = (est.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );
  const subtotal = est.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const beforeFee = subtotal * (1 + est.markupPct / 100);
  const total = beforeFee * (1 + est.convenienceFeeRate);
  return fmtBig(total);
}

/** Compute the total for a quote from its line items + the rooms it links into.
 *  Returns null when the quote has no line items.
 *  Server-side use: lib/repositories/quoteRepo.ts feeds this via the list API. */
export function quoteTotal(input: {
  lineItems: LineItemCalc[];
  estimate: { items: RoomItem[] };
  markupPct: number;
  convenienceFeeRate: number;
}): number | null {
  if (input.lineItems.length === 0) return null;
  const rooms = input.estimate.items.filter(
    (i): i is RoomItem => i.type === "room"
  );
  const subtotal = input.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const beforeFee = subtotal * (1 + input.markupPct / 100);
  return beforeFee * (1 + input.convenienceFeeRate);
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
