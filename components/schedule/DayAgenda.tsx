"use client";

import { EventCard } from "@/components/schedule/EventCard";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import type { AgendaSection } from "@/lib/schedule/agenda";

export function DayAgenda({
  sections,
  onOpenEvent,
}: {
  sections: AgendaSection[];
  onOpenEvent: (event: CalEvent) => void;
}) {
  return (
    <div className="px-3 pt-1 max-w-[680px] mx-auto w-full">
      {sections.map((section) => (
        <section key={section.date}>
          <h2
            className={cn(
              "text-[13px] font-[700] pt-2.5 pb-1.5",
              section.isToday && "text-[var(--accent)]"
            )}
          >
            {section.label}
          </h2>
          {section.events.length > 0 ? (
            section.events.map((e) => (
              <EventCard key={e.id} event={e as CalEvent} onOpen={onOpenEvent} />
            ))
          ) : (
            <p className="text-[11.5px] text-[var(--muted)] italic pb-2">
              No jobs
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
