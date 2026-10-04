"use client";

import { eventAccent, eventLabel } from "@/components/schedule/eventMeta";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { MapPinIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
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
        "card w-full flex gap-3 text-left p-4 mb-2.5 cursor-pointer",
        "transition-[border-color,transform] duration-200 ease-[var(--ease)]",
        "hover:border-[var(--ink-2)] active:scale-[0.99]"
      )}
    >
      <div className="w-[52px] shrink-0 leading-tight">
        <div className="type-figure text-[14.5px] font-[600]">
          {formatClock(event.startTime)}
        </div>
        <div className="type-figure text-[13px] text-[var(--muted)] mt-0.5">
          {formatClock(event.endTime)}
        </div>
      </div>
      <div className={cn("w-[3px] shrink-0", eventAccent(event.type))} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-[600] tracking-[-0.01em] truncate">
          {event.title}
        </div>
        <div className="text-[13.5px] text-[var(--ink-2)] mt-1 flex items-center gap-2 min-w-0">
          <Tag className="shrink-0">{eventLabel(event.type)}</Tag>
          <span className="truncate">{event.customer?.name ?? ""}</span>
        </div>
        {event.address ? (
          <div className="text-[13.5px] text-[var(--muted)] mt-1.5 flex items-center gap-1.5 min-w-0">
            <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{event.address}</span>
          </div>
        ) : null}
        {event.assignees.length > 0 ? (
          <div className="flex mt-2 gap-1">
            {event.assignees.map((a) => (
              <CrewAvatar key={a.id} name={a.name} size="lg" />
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
