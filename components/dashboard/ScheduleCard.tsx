"use client";

import { Card } from "@/components/ui/Card";
import { CardLink } from "@/components/ui/CardLink";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { CalendarBlankIcon, CheckIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

const tagLabels: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Other",
};

function isPast(ev: CalEvent): boolean {
  const now = new Date();
  const [h, m] = ev.endTime.split(":").map(Number);
  const end = new Date();
  end.setHours(h, m, 0, 0);
  return end < now;
}

interface Props {
  events: CalEvent[];
}

export function ScheduleCard({ events }: Props) {
  const today = todayStr();
  const todayEvents = events
    .filter((e) => e.date.slice(0, 10) === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Card
      title="Today's schedule"
      sub={
        todayEvents.length === 0
          ? "Nothing booked"
          : `${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"}`
      }
      action={<CardLink href="/schedule">Full calendar</CardLink>}
    >
      {todayEvents.length === 0 ? (
        <div className="flex items-center gap-3 py-3 text-[14px] text-[var(--muted)]">
          <CalendarBlankIcon aria-hidden="true" className="size-5 shrink-0" />
          No events scheduled today.
        </div>
      ) : (
        <ol className="relative">
          {/* the timeline rule */}
          <span
            aria-hidden="true"
            className="absolute top-3 bottom-3 left-[61px] w-px bg-[var(--line)]"
          />
          {todayEvents.map((ev) => {
            const completed = isPast(ev);
            const customerName = ev.customer?.name;
            return (
              <li
                key={ev.id}
                className="relative grid grid-cols-[48px_28px_minmax(0,1fr)] items-start py-3"
              >
                <span className="type-figure text-[13px] text-[var(--muted)] pt-px">
                  {ev.startTime}
                </span>
                <span className="relative flex justify-center pt-[5px]">
                  {completed ? (
                    <span className="size-[14px] -mt-[2px] flex items-center justify-center bg-[var(--ok)] text-[var(--bg)]">
                      <CheckIcon
                        aria-hidden="true"
                        weight="bold"
                        className="size-[10px]"
                      />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "size-[10px]",
                        ev.type === "job"
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--bg)] border-2 border-[var(--ink-2)]"
                      )}
                    />
                  )}
                </span>
                <div className="min-w-0">
                  <div
                    className={cn(
                      "text-[14.5px] font-[600] tracking-[-0.01em] truncate",
                      completed &&
                        "text-[var(--muted)] line-through decoration-[var(--line-2)]"
                    )}
                  >
                    {ev.title}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5 flex-wrap text-[13px] text-[var(--muted)]">
                    <Tag className="h-[20px] text-[12px]">
                      {tagLabels[ev.type] ?? ev.type}
                    </Tag>
                    {ev.assignees.length > 0 && (
                      <span className="flex items-center">
                        {ev.assignees.slice(0, 3).map((m) => (
                          <span
                            key={m.id}
                            className="-ml-1 first:ml-0 rounded-full ring-2 ring-[var(--surface)]"
                          >
                            <CrewAvatar name={m.name} size="md" />
                          </span>
                        ))}
                      </span>
                    )}
                    {customerName && (
                      <span className="truncate">{customerName}</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
