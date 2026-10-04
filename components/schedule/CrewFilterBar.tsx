"use client";

import {
  type CrewFilter,
  type EventForCrew,
  weekCrewCounts,
} from "@/components/schedule/crewFilters";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { cn } from "@/lib/cn";

interface CrewFilterBarProps {
  crew: { id: string; name: string }[];
  events: EventForCrew[];
  weekStart: string;
  days: number;
  active: CrewFilter;
  onChange: (next: CrewFilter) => void;
}

export function CrewFilterBar({
  crew,
  events,
  weekStart,
  days,
  active,
  onChange,
}: CrewFilterBarProps) {
  const counts = weekCrewCounts(events, weekStart, days);
  const total = counts.get("all") ?? 0;
  const activeName =
    active === "all" ? null : (crew.find((c) => c.id === active)?.name ?? null);
  const focusCount = active === "all" ? total : (counts.get(active) ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 mb-4">
      <div className="flex items-center gap-2.5 min-w-0 max-w-full">
        <span className="type-label shrink-0">Crew</span>
        <div className="flex gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => onChange("all")}
            aria-pressed={active === "all"}
            className={cn(CHIP, "px-3", chipState(active === "all"))}
          >
            <span>All</span>
            <span className={countClass(active === "all")}>{total}</span>
          </button>
          {crew.map((m) => {
            const isActive = active === m.id;
            const c = counts.get(m.id) ?? 0;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id)}
                aria-pressed={isActive}
                className={cn(CHIP, "pl-1.5 pr-3", chipState(isActive))}
              >
                <CrewAvatar
                  name={m.name}
                  size="lg"
                  className={isActive ? "ring-1 ring-[var(--bg)]" : undefined}
                />
                <span>{m.name}</span>
                <span className={countClass(isActive)}>{c}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-[13px] text-[var(--muted)] md:ml-auto">
        {activeName ? (
          <>
            Filtered to{" "}
            <strong className="text-[var(--ink)] font-[600]">
              {activeName}
            </strong>{" "}
            · {focusCount} event{focusCount === 1 ? "" : "s"} this week
          </>
        ) : (
          <>
            Showing{" "}
            <strong className="text-[var(--ink)] font-[600]">all crews</strong>{" "}
            · {total} event{total === 1 ? "" : "s"} this week
          </>
        )}
      </div>
    </div>
  );
}

/** Matches FilterPill: ink fill when active, outlined otherwise. */
const CHIP =
  "inline-flex items-center gap-2 shrink-0 whitespace-nowrap h-[36px] border rounded-[var(--r)] cursor-pointer text-[13.5px] font-[560] transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease)] active:scale-[0.97]";

function chipState(active: boolean): string {
  return active
    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
    : "bg-transparent text-[var(--ink-2)] border-[var(--line-2)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]";
}

function countClass(active: boolean): string {
  return cn(
    "type-figure leading-none text-[12px]",
    active ? "text-[var(--bg)] opacity-70" : "text-[var(--muted)]"
  );
}
