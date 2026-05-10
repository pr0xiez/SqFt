export type CrewFilter = "all" | number;

export type EventForCrew = {
  id: number;
  date: string;
  crewMembers: { id: number; name: string; role: string }[];
};

export function eventMatchesCrew(
  event: EventForCrew,
  filter: CrewFilter
): boolean {
  if (filter === "all") return true;
  return event.crewMembers.some((m) => m.id === filter);
}

/**
 * Count events per crew member that fall within a [weekStart, weekStart+days) window.
 * Returns counts keyed by crew id, plus a special "all" key for the total event
 * count in the window (regardless of crew).
 */
export function weekCrewCounts(
  events: EventForCrew[],
  weekStart: string,
  days: number
): Map<number | "all", number> {
  const startMs = Date.parse(`${weekStart}T00:00:00`);
  const endMs = startMs + days * 86_400_000;
  const counts = new Map<number | "all", number>();

  for (const ev of events) {
    const ms = Date.parse(`${ev.date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(ms) || ms < startMs || ms >= endMs) continue;

    counts.set("all", (counts.get("all") ?? 0) + 1);
    for (const m of ev.crewMembers) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
  }
  return counts;
}
