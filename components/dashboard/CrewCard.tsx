"use client";

import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

interface CrewEntry {
  id: string;
  name: string;
  initials: string;
  jobTitle: string;
  timeRange: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function buildCrewEntries(events: CalEvent[], today: string): CrewEntry[] {
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);
  const seen = new Set<string>();
  const entries: CrewEntry[] = [];

  for (const ev of todayEvents) {
    for (const member of ev.assignees) {
      if (!seen.has(member.id)) {
        seen.add(member.id);
        entries.push({
          id: member.id,
          name: member.name,
          initials: getInitials(member.name),
          jobTitle: ev.title,
          timeRange: `${ev.startTime}–${ev.endTime}`,
        });
      }
    }
  }

  return entries;
}

interface Props {
  events: CalEvent[];
}

export function CrewCard({ events }: Props) {
  const today = todayStr();
  const crew = buildCrewEntries(events, today);

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <header className="flex items-baseline justify-between mb-[18px] pb-[14px] border-b border-[var(--line)]">
        <div className="text-[14px] font-[600] tracking-[-0.01em]">
          Crew · today
        </div>
        <button
          type="button"
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink)] tracking-[.02em]"
          onClick={() => {}}
        >
          Manage →
        </button>
      </header>

      {crew.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-2">
          No crew assigned today.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {crew.map((member, idx) => (
            <li
              key={member.id}
              className={`flex items-center gap-3 py-2.5 ${
                idx < crew.length - 1
                  ? "border-b border-dashed border-[var(--line)]"
                  : ""
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center font-[var(--font-mono)] text-[11px] font-[600] shrink-0">
                {member.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-[600] tracking-[-0.01em]">
                  {member.name}
                </div>
                <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate">
                  {member.jobTitle} · {member.timeRange}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
