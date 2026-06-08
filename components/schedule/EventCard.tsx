"use client";

import { eventAccent, eventLabel } from "@/components/schedule/eventMeta";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { formatClock } from "@/lib/schedule/agenda";

export function EventCard({
  event,
  onOpen,
}: {
  event: CalEvent;
  onOpen: (event: CalEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={cn(
        "w-full flex gap-2.5 text-left",
        "bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-2.5",
        "transition-colors hover:border-[var(--accent)]"
      )}
    >
      <div className="w-[46px] shrink-0 text-[12px] font-[700] leading-tight">
        {formatClock(event.startTime)}
        <span className="block font-[500] text-[var(--muted)] text-[11px]">
          –{formatClock(event.endTime)}
        </span>
      </div>
      <div className={cn("w-1 rounded shrink-0", eventAccent(event.type))} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-[600] truncate">{event.title}</div>
        <div className="text-[11.5px] text-[var(--ink-2)] mt-0.5 flex items-center gap-1.5">
          <span className="text-[9px] font-[700] uppercase px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
            {eventLabel(event.type)}
          </span>
          {event.customer?.name ?? ""}
        </div>
        {event.address ? (
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5 truncate">
            📍 <span>{event.address}</span>
          </div>
        ) : null}
        {event.assignees.length > 0 ? (
          <div className="flex mt-1.5 gap-1">
            {event.assignees.map((a) => (
              <CrewAvatar key={a.id} name={a.name} size="lg" />
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
