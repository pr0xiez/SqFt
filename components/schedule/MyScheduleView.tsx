"use client";

import { useEffect, useMemo, useState } from "react";
import { DayAgenda } from "@/components/schedule/DayAgenda";
import { JobCard } from "@/components/schedule/JobCard";
import { buttonClasses } from "@/components/ui/Button";
import {
  CalendarDotsIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <div className="seg flex-1 flex">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="flex-1 min-h-[36px]"
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
      <header className="max-w-[680px] mx-auto w-full">
        <PageHeader title="My Schedule" className="mb-4 md:mb-5" />
        <div className="flex gap-2">
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
        <div className="flex items-center justify-between gap-2 mt-3 pb-3 border-b border-[var(--line)]">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => setFocusedDate((d) => shiftFocus(d, range, -1))}
            className={buttonClasses({ size: "icon", className: "size-11" })}
          >
            <CaretLeftIcon aria-hidden="true" weight="bold" />
          </button>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setFocusedDate(today)}
              aria-label="Jump to today"
              aria-pressed={isToday}
              title="Jump to today"
              className={buttonClasses({
                variant: isToday ? "ghost" : "primary",
                size: "sm",
              })}
            >
              <CalendarDotsIcon aria-hidden="true" />
              {isToday ? "Today" : "Back to today"}
            </button>
            <span className="text-[14px] font-[600] text-[var(--ink-2)] truncate max-w-full">
              {formatFocusLabel(focusedDate, range)}
            </span>
          </div>
          <button
            type="button"
            aria-label="Next"
            onClick={() => setFocusedDate((d) => shiftFocus(d, range, 1))}
            className={buttonClasses({ size: "icon", className: "size-11" })}
          >
            <CaretRightIcon aria-hidden="true" weight="bold" />
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
