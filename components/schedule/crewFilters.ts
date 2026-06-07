export type CrewFilter = "all" | string;

export type EventForCrew = {
  id: number;
  date: string;
  assignees: { id: string; name: string }[];
};

export function eventMatchesCrew(
  event: EventForCrew,
  filter: CrewFilter
): boolean {
  if (filter === "all") return true;
  return event.assignees.some((m) => m.id === filter);
}

/**
 * Count events per assignee within a [weekStart, weekStart+days) window.
 * Returns counts keyed by user id, plus an "all" key for the window total.
 */
export function weekCrewCounts(
  events: EventForCrew[],
  weekStart: string,
  days: number
): Map<string | "all", number> {
  const startMs = Date.parse(`${weekStart}T00:00:00`);
  const endMs = startMs + days * 86_400_000;
  const counts = new Map<string | "all", number>();

  for (const ev of events) {
    const ms = Date.parse(`${ev.date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(ms) || ms < startMs || ms >= endMs) continue;

    counts.set("all", (counts.get("all") ?? 0) + 1);
    for (const m of ev.assignees) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
  }
  return counts;
}
