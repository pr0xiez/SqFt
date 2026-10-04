"use client";

import { Card } from "@/components/ui/Card";
import { CardLink } from "@/components/ui/CardLink";
import { UsersIcon } from "@/components/ui/icons";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { getInitials } from "@/lib/nav/initials";
import { todayStr } from "@/lib/utils";

interface CrewEntry {
  id: string;
  name: string;
  initials: string;
  jobTitle: string;
  timeRange: string;
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
          timeRange: `${ev.startTime}-${ev.endTime}`,
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
    <Card
      title="Crew today"
      action={<CardLink href="/schedule">Manage</CardLink>}
    >
      {crew.length === 0 ? (
        <div className="flex items-center gap-3 py-3 text-[14px] text-[var(--muted)]">
          <UsersIcon aria-hidden="true" className="size-5 shrink-0" />
          No crew assigned today.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--line)]">
          {crew.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="size-9 rounded-full bg-[var(--ink)] text-[var(--bg)] flex items-center justify-center text-[12.5px] font-[700] shrink-0">
                {member.initials}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-[600] truncate">
                  {member.name}
                </div>
                <div className="text-[13px] text-[var(--muted)] mt-0.5 truncate">
                  {member.jobTitle}{" "}
                  <span className="type-figure text-[12.5px]">
                    {member.timeRange}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
