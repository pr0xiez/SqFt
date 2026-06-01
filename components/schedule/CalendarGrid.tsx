"use client";

import { useEffect, useMemo, useState } from "react";
import { CrewFilterBar } from "@/components/schedule/CrewFilterBar";
import {
  type CrewFilter,
  eventMatchesCrew,
} from "@/components/schedule/crewFilters";
import { EventFormPanel } from "@/components/schedule/EventFormPanel";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useCrewMembers } from "@/lib/hooks/useCrewMembers";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import {
  type CalEvent,
  useCreateEvent,
  useDeleteEvent,
  useEvents,
} from "@/lib/hooks/useEvents";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import {
  addDays,
  dateStr,
  getWeekStart,
  timeToMinutes,
  todayStr,
} from "@/lib/utils";

const START_HOUR = 7;
const END_HOUR = 19;
const PX_PER_HOUR = 52;
const BODY_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR;
const PX_PER_MIN = PX_PER_HOUR / 60;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => i + START_HOUR
);

const EVENT_BG: Record<string, string> = {
  job: "bg-[var(--accent)]",
  visit: "bg-[var(--gold)]",
  other: "bg-[var(--sage)]",
};

interface PlacedEvent {
  ev: CalEvent;
  startMin: number;
  endMin: number;
  lane: number;
  totalLanes: number;
}

function layoutEvents(dayEvents: CalEvent[]): PlacedEvent[] {
  const mapped = dayEvents
    .map((ev) => ({
      ev,
      startMin: timeToMinutes(ev.startTime) - START_HOUR * 60,
      endMin: timeToMinutes(ev.endTime) - START_HOUR * 60,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clusters: { items: typeof mapped; endMax: number }[] = [];
  let cur: (typeof clusters)[0] | null = null;

  for (const e of mapped) {
    if (cur && e.startMin < cur.endMax) {
      cur.items.push(e);
      cur.endMax = Math.max(cur.endMax, e.endMin);
    } else {
      cur = { items: [e], endMax: e.endMin };
      clusters.push(cur);
    }
  }

  const placed: PlacedEvent[] = [];
  for (const cl of clusters) {
    const lanes: number[] = [];
    for (const e of cl.items) {
      let lane = lanes.findIndex((end) => end <= e.startMin);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(e.endMin);
      } else {
        lanes[lane] = e.endMin;
      }
      placed.push({ ...e, lane, totalLanes: 0 });
    }
    const total = lanes.length;
    for (const p of placed) {
      if (cl.items.some((i) => i.ev.id === p.ev.id)) {
        p.totalLanes = total;
      }
    }
  }
  return placed;
}

export function ScheduleView({ canEdit }: { canEdit: boolean }) {
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");

  const isMobile = useIsMobile();
  const daysToShow = isMobile ? 3 : 7;

  const { data: events = [] } = useEvents();
  const { data: customers = [] } = useCustomers();
  const { data: estimatesData } = useEstimates({
    page: 1,
    perPage: 100,
    sort: "date",
    dir: "desc",
    q: "",
    status: "all",
  });
  const estimates = estimatesData?.items ?? [];
  const { data: crew = [] } = useCrewMembers();
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();
  const { showToast } = useToast();

  const days = useMemo(
    () =>
      weekStart
        ? Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i))
        : [],
    [weekStart, daysToShow]
  );

  const [today, setToday] = useState("");

  useEffect(() => {
    const t = todayStr();
    setToday(t);
    setSelectedDate(t);
    setWeekStart(getWeekStart(new Date()));
  }, []);

  function openNewEvent(date: string) {
    setSelectedDate(date);
    setEditingEvent(null);
    setPanelOpen(true);
  }

  function openEditEvent(ev: CalEvent) {
    setEditingEvent(ev);
    setSelectedDate(ev.date.slice(0, 10));
    setPanelOpen(true);
  }

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      const start = ev.date.slice(0, 10);
      const end = ev.endDate ? ev.endDate.slice(0, 10) : start;
      let cur = start;
      while (cur <= end) {
        if (!map[cur]) map[cur] = [];
        map[cur].push(ev);
        const d = new Date(`${cur}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        cur = d.toISOString().slice(0, 10);
      }
    }
    return map;
  }, [events]);

  const weekLabel =
    days.length > 0
      ? `Week of ${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${days[days.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${days[days.length - 1].getFullYear()}`
      : "";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Schedule
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {weekLabel}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              setWeekStart((d) => (d ? addDays(d, -daysToShow) : d))
            }
          >
            ←
          </Button>
          <Button
            size="sm"
            onClick={() => setWeekStart(getWeekStart(new Date()))}
          >
            Today
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setWeekStart((d) => (d ? addDays(d, daysToShow) : d))
            }
          >
            →
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openNewEvent(today)}
            >
              + Add Event
            </Button>
          )}
        </div>
      </div>

      {/* Crew filter bar */}
      <CrewFilterBar
        crew={crew.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
        events={events}
        weekStart={weekStart ? dateStr(weekStart) : ""}
        days={daysToShow}
        active={crewFilter}
        onChange={setCrewFilter}
      />

      {/* Calendar */}
      <div
        className={cn(
          "bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden",
          crewFilter !== "all" && "cal-crew-focus"
        )}
      >
        {/* Day headers */}
        <div
          className="grid border-b border-[var(--line)]"
          style={{
            gridTemplateColumns: `52px repeat(${daysToShow}, 1fr)`,
          }}
        >
          {/* Month label in time gutter */}
          <div className="bg-[var(--surface-2)] border-r border-[var(--line)] px-1.5 py-2 text-right">
            <span className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.06em]">
              {days[0]?.toLocaleDateString("en-US", { month: "short" })}
            </span>
          </div>
          {days.map((d) => {
            const ds = dateStr(d);
            const isToday = ds === today;
            return (
              <button
                key={ds}
                type="button"
                className={cn(
                  "px-2.5 py-2 text-center border-l border-[var(--line)] bg-[var(--surface)] transition-colors w-full",
                  canEdit && "cursor-pointer hover:bg-[var(--surface-2)]",
                  isToday &&
                    "bg-[rgba(192,52,26,0.04)] [html[data-theme=dark]_&]:bg-[rgba(255,106,68,0.06)]"
                )}
                onClick={() => canEdit && openNewEvent(ds)}
              >
                <div className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.06em] mb-0.5">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={cn(
                    "text-[18px] font-[600] leading-tight tracking-[-0.01em]",
                    isToday ? "text-[var(--accent)]" : "text-[var(--ink)]"
                  )}
                >
                  {d.getDate()}
                </div>
              </button>
            );
          })}
        </div>

        {/* Body: time gutter + day columns */}
        <div
          className="flex"
          style={{ height: BODY_HEIGHT, overflowY: "auto" }}
        >
          {/* Time gutter */}
          <div
            className="relative shrink-0 border-r border-[var(--line)]"
            style={{ width: 52, minHeight: BODY_HEIGHT }}
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 font-[var(--font-mono)] text-[9px] text-[var(--muted)] -translate-y-1/2"
                style={{ top: (hour - START_HOUR) * PX_PER_HOUR }}
              >
                {hour % 12 === 0 ? 12 : hour % 12}
                {hour < 12 ? "a" : "p"}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            className="grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${daysToShow}, 1fr)`,
            }}
          >
            {days.map((d) => {
              const ds = dateStr(d);
              const isToday = ds === today;
              const dayEvents = eventsByDate[ds] ?? [];
              const placed = layoutEvents(dayEvents);

              return (
                // biome-ignore lint/a11y/useSemanticElements: contains inner <button> event chips — nested <button> is invalid HTML
                <div
                  key={ds}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "relative border-l border-[var(--line)]",
                    canEdit && "cursor-pointer",
                    isToday &&
                      "bg-[rgba(192,52,26,0.02)] [html[data-theme=dark]_&]:bg-[rgba(255,106,68,0.04)]"
                  )}
                  style={{ minHeight: BODY_HEIGHT }}
                  onClick={() => canEdit && openNewEvent(ds)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && canEdit && openNewEvent(ds)
                  }
                >
                  {/* Hour lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-[var(--line)] pointer-events-none"
                      style={{ top: (hour - START_HOUR) * PX_PER_HOUR }}
                    />
                  ))}
                  {/* Half-hour lines */}
                  {HOURS.slice(0, -1).map((hour) => (
                    <div
                      key={`${hour}-half`}
                      className="absolute left-0 right-0 border-t border-dashed border-[var(--line)] opacity-50 pointer-events-none"
                      style={{
                        top:
                          (hour - START_HOUR) * PX_PER_HOUR + PX_PER_HOUR / 2,
                      }}
                    />
                  ))}
                  {/* Events */}
                  {placed.map(({ ev, startMin, endMin, lane, totalLanes }) => {
                    const top = startMin * PX_PER_MIN;
                    const height = Math.max(
                      (endMin - startMin) * PX_PER_MIN - 2,
                      22
                    );
                    const widthPct = 100 / totalLanes;
                    const leftPct = lane * widthPct;
                    const matches = eventMatchesCrew(ev, crewFilter);

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit) openEditEvent(ev);
                        }}
                        style={{
                          position: "absolute",
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                        className={cn(
                          "cal-event",
                          matches && "crew-match",
                          "rounded-[4px] px-[7px] py-[5px] text-left text-white overflow-hidden cursor-pointer border-l-[3px] border-l-black/20 transition-[filter,box-shadow,opacity] duration-[120ms] hover:brightness-105 hover:z-10 hover:shadow-[var(--shadow)]",
                          EVENT_BG[ev.type] ?? EVENT_BG.other
                        )}
                      >
                        <div className="text-[11px] font-[600] leading-[1.2] tracking-[-0.01em] truncate">
                          {ev.title}
                        </div>
                        {height > 30 && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-85 mt-0.5 whitespace-nowrap">
                            {ev.startTime}–{ev.endTime}
                          </div>
                        )}
                        {height > 46 && ev.crewMembers.length > 0 && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-75 mt-px flex items-center gap-1 truncate">
                            <span className="flex items-center gap-[2px] flex-shrink-0">
                              {ev.crewMembers.slice(0, 3).map((m) => (
                                <CrewAvatar
                                  key={m.id}
                                  name={m.name}
                                  size="sm"
                                />
                              ))}
                              {ev.crewMembers.length > 3 && (
                                <span className="ml-[2px]">
                                  +{ev.crewMembers.length - 3}
                                </span>
                              )}
                            </span>
                            <span className="truncate">
                              {ev.crewMembers.map((m) => m.name).join(" · ")}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {canEdit && (
        <EventFormPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          defaultDate={selectedDate}
          editingEvent={editingEvent}
          customers={customers}
          estimates={estimates}
          onSave={async (data) => {
            try {
              await createEvent.mutateAsync(data);
              setPanelOpen(false);
              showToast("Event saved", data.title);
            } catch {
              showToast("Failed to save event");
            }
          }}
          onDelete={async (id) => {
            try {
              await deleteEvent.mutateAsync(id);
              setPanelOpen(false);
              showToast("Event deleted");
            } catch {
              showToast("Failed to delete event");
            }
          }}
        />
      )}
    </div>
  );
}
