import { addDays, dateStr, getWeekStart } from "@/lib/utils";

export type Scope = "mine" | "team";
export type Range = "day" | "week";

export interface AgendaEvent {
  id: number;
  type: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string; // ISO datetime or YYYY-MM-DD
  endDate?: string | null;
  assignees: { id: string; name: string }[];
}

export interface AgendaSection {
  date: string; // YYYY-MM-DD
  label: string;
  isToday: boolean;
  events: AgendaEvent[];
}

/** A YYYY-MM-DD local Date anchored at noon to avoid TZ/DST edge slips. */
function noon(day: string): Date {
  return new Date(`${day.slice(0, 10)}T12:00:00`);
}

/** "08:00" → "8:00a", "13:05" → "1:05p", "00:00" → "12:00a". */
export function formatClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")}${am ? "a" : "p"}`;
}

/** Inclusive day-span test. YYYY-MM-DD strings compare lexicographically. */
export function eventOccursOn(
  ev: { date: string; endDate?: string | null },
  day: string
): boolean {
  const start = ev.date.slice(0, 10);
  const end = ev.endDate ? ev.endDate.slice(0, 10) : start;
  return day >= start && day <= end;
}

/** Mon..Sun (YYYY-MM-DD) of the week containing `focused`. */
export function weekDates(focused: string): string[] {
  const start = getWeekStart(noon(focused));
  return Array.from({ length: 7 }, (_, i) => dateStr(addDays(start, i)));
}

export function sectionDates(focused: string, range: Range): string[] {
  return range === "day" ? [focused.slice(0, 10)] : weekDates(focused);
}

export function shiftFocus(focused: string, range: Range, dir: 1 | -1): string {
  return dateStr(addDays(noon(focused), range === "week" ? 7 * dir : dir));
}

export function formatSectionLabel(day: string): string {
  const d = noon(day);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${wd} · ${md}`;
}

export function buildAgendaSections(
  events: AgendaEvent[],
  opts: {
    focusedDate: string;
    range: Range;
    scope: Scope;
    currentUserId: string;
    today: string;
  }
): AgendaSection[] {
  const scoped =
    opts.scope === "mine"
      ? events.filter((e) =>
          e.assignees.some((a) => a.id === opts.currentUserId)
        )
      : events;

  return sectionDates(opts.focusedDate, opts.range).map((day) => ({
    date: day,
    label: formatSectionLabel(day),
    isToday: day === opts.today,
    events: scoped
      .filter((e) => eventOccursOn(e, day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
}
