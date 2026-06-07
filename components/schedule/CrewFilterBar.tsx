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
    <div
      className={cn(
        "flex items-center gap-3 mb-3.5 px-3.5 py-2.5",
        "bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r)]",
        "flex-wrap"
      )}
    >
      <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] font-[600] text-[var(--muted)]">
        CREW
      </div>
      <div className="flex gap-1.5 flex-wrap flex-1">
        <button
          type="button"
          onClick={() => onChange("all")}
          className={cn(
            "inline-flex items-center gap-[7px] px-3 py-[5px] rounded-full border cursor-pointer",
            "font-[var(--font-mono)] text-[11px] tracking-[0.01em] transition-[background,color,border-color] duration-150",
            active === "all"
              ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
              : "bg-transparent text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]"
          )}
        >
          All
          <span
            className={cn(
              "font-[var(--font-mono)] text-[10px] font-[500] tracking-[0.04em]",
              active === "all"
                ? "text-[var(--bg)] opacity-70"
                : "text-[var(--muted)]"
            )}
          >
            {total}
          </span>
        </button>
        {crew.map((m) => {
          const isActive = active === m.id;
          const c = counts.get(m.id) ?? 0;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={cn(
                "inline-flex items-center gap-[7px] pl-1.5 pr-2.5 py-[5px] rounded-full border cursor-pointer",
                "font-[var(--font-mono)] text-[11px] tracking-[0.01em] transition-[background,color,border-color] duration-150",
                isActive
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                  : "bg-transparent text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]"
              )}
            >
              <CrewAvatar name={m.name} size="md" />
              {m.name}
              <span
                className={cn(
                  "font-[var(--font-mono)] text-[10px] font-[500] tracking-[0.04em]",
                  isActive
                    ? "text-[var(--bg)] opacity-70"
                    : "text-[var(--muted)]"
                )}
              >
                {c}
              </span>
            </button>
          );
        })}
      </div>
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[0.02em]">
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
