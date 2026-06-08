"use client";

import { useEffect, useMemo, useState } from "react";
import { DayAgenda } from "@/components/schedule/DayAgenda";
import { JobCard } from "@/components/schedule/JobCard";
import { cn } from "@/lib/cn";
import { type CalEvent, useEvents } from "@/lib/hooks/useEvents";
import {
  buildAgendaSections,
  formatFocusLabel,
  type Range,
  type Scope,
  shiftFocus,
} from "@/lib/schedule/agenda";
import { todayStr } from "@/lib/utils";

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex-1 flex bg-[var(--surface-2)] rounded-lg p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 text-center text-[11px] font-[600] py-1.5 rounded-md transition-colors",
            value === o.value
              ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
              : "text-[var(--muted)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MyScheduleView({ currentUserId }: { currentUserId: string }) {
  const [scope, setScope] = useState<Scope>("mine");
  const [range, setRange] = useState<Range>("day");
  // Set after mount so "today" is the device's local day (avoids SSR mismatch).
  const [focusedDate, setFocusedDate] = useState<string>("");
  const [today, setToday] = useState<string>("");
  const [selected, setSelected] = useState<CalEvent | null>(null);

  useEffect(() => {
    const t = todayStr();
    setToday(t);
    setFocusedDate(t);
  }, []);

  const { data: events = [] } = useEvents();

  const sections = useMemo(() => {
    if (!focusedDate) return [];
    return buildAgendaSections(events, {
      focusedDate,
      range,
      scope,
      currentUserId,
      today,
    });
  }, [events, focusedDate, range, scope, currentUserId, today]);

  if (!focusedDate) return null;

  const isToday = focusedDate === today;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="bg-[var(--surface)] border-b border-[var(--line)] px-3 pt-2.5 pb-2 max-w-[680px] mx-auto w-full">
        <div className="flex gap-1.5">
          <Segmented
            options={[
              { value: "mine", label: "My" },
              { value: "team", label: "Team" },
            ]}
            value={scope}
            onChange={setScope}
          />
          <Segmented
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => setFocusedDate((d) => shiftFocus(d, range, -1))}
            className="w-7 h-7 shrink-0 rounded-lg bg-[var(--surface-2)] flex items-center justify-center hover:border hover:border-[var(--accent)] transition-colors"
          >
            ‹
          </button>
          <div className="flex flex-col items-center gap-0.5 min-w-0">
            <button
              type="button"
              onClick={() => setFocusedDate(today)}
              aria-label="Jump to today"
              aria-pressed={isToday}
              title="Jump to today"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                "text-[11px] font-[700] transition-colors active:scale-95",
                isToday
                  ? "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--accent)]"
                  : "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)] shadow-sm"
              )}
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <title>Today</title>
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {isToday ? "Today" : "Back to today"}
            </button>
            <span className="text-[11px] font-[600] text-[var(--ink-2)] truncate max-w-full">
              {formatFocusLabel(focusedDate, range)}
            </span>
          </div>
          <button
            type="button"
            aria-label="Next"
            onClick={() => setFocusedDate((d) => shiftFocus(d, range, 1))}
            className="w-7 h-7 shrink-0 rounded-lg bg-[var(--surface-2)] flex items-center justify-center hover:border hover:border-[var(--accent)] transition-colors"
          >
            ›
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <DayAgenda sections={sections} onOpenEvent={setSelected} />
      </div>

      <JobCard event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
