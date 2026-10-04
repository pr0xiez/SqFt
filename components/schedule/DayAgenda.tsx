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
    <div className="pt-1 pb-6 max-w-[680px] mx-auto w-full">
      {sections.map((section) => (
        <section key={section.date} className="mb-2">
          <h2
            className={cn(
              "text-[14px] font-[650] tracking-[-0.005em] pt-3 pb-2",
              section.isToday ? "text-[var(--accent-ink)]" : "text-[var(--ink)]"
            )}
          >
            {section.label}
          </h2>
          {section.events.length > 0 ? (
            section.events.map((e) => (
              <EventCard
                key={e.id}
                event={e as CalEvent}
                onOpen={onOpenEvent}
              />
            ))
          ) : (
            <p className="text-[14px] text-[var(--muted)] pb-3 border-b border-[var(--line)]">
              No jobs
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
