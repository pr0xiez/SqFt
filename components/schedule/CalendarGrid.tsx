"use client";

import { useEffect, useMemo, useState } from "react";
import { BacklogStrip } from "@/components/schedule/BacklogStrip";
import { CrewFilterBar } from "@/components/schedule/CrewFilterBar";
import {
  type CrewFilter,
  eventMatchesCrew,
} from "@/components/schedule/crewFilters";
import {
  type EstimateOption,
  type EventFormDefaults,
  EventFormPanel,
} from "@/components/schedule/EventFormPanel";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useAssignableUsers } from "@/lib/hooks/useAssignableUsers";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import {
  type CalEvent,
  useCreateEvent,
  useDeleteEvent,
  useEvents,
  useUpdateEvent,
} from "@/lib/hooks/useEvents";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useSchedulableEstimates } from "@/lib/hooks/useSchedulableEstimates";
import type { SchedulableCandidate } from "@/lib/schedule/backlog";
import {
  BODY_HEIGHT,
  GRID_HOURS,
  layoutDayEvents,
  nowLineTop,
  PX_PER_HOUR,
  START_HOUR,
  slotFromOffsetY,
} from "@/lib/schedule/grid";
import { addDays, dateStr, getWeekStart, todayStr } from "@/lib/utils";

const EVENT_BG: Record<string, string> = {
  job: "bg-[var(--accent)]",
  visit: "bg-[var(--gold)]",
  other: "bg-[var(--sage)]",
};

// Today-tint for the header cell. Layered as a gradient over the solid
// surface color rather than a translucent background-color, so the cell stays
// opaque against whatever sits behind it.
const TODAY_HEADER_TINT =
  "[background-image:linear-gradient(rgba(192,52,26,0.04),rgba(192,52,26,0.04))] [html[data-theme=dark]_&]:[background-image:linear-gradient(rgba(255,106,68,0.06),rgba(255,106,68,0.06))]";

export function ScheduleView({ canEdit }: { canEdit: boolean }) {
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [formDefaults, setFormDefaults] = useState<EventFormDefaults | null>(
    null
  );
  const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");

  const isMobile = useIsMobile();
  const daysToShow = isMobile ? 3 : 7;

  const { data: events = [] } = useEvents();
  const { data: customersData } = useCustomers({
    page: 1,
    perPage: 100,
    sort: "name",
    dir: "asc",
    q: "",
    source: "all",
    pipeline: "any",
  });
  const customers = customersData?.items ?? [];
  const { data: estimatesData } = useEstimates({
    page: 1,
    perPage: 100,
    sort: "date",
    dir: "desc",
    q: "",
    status: "all",
  });
  const estimates = estimatesData?.items ?? [];
  const { data: schedulableData } = useSchedulableEstimates();
  const backlog = useMemo(
    () => (Array.isArray(schedulableData) ? schedulableData : []),
    [schedulableData]
  );
  const { data: crew = [] } = useAssignableUsers();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(editingEvent?.id ?? 0);
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
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    const t = todayStr();
    setToday(t);
    setSelectedDate(t);
    setWeekStart(getWeekStart(new Date()));
  }, []);

  // Current-time line, refreshed each minute (client-only, like `today`).
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // A backlog estimate (or its customer) may be older than the 100-row picker
  // fetches above — merge synthetic options so the pre-filled selects never
  // show blank.
  const customerOptions = useMemo(() => {
    const opts: { id: number; name: string }[] = [...customers];
    for (const c of backlog) {
      if (c.customerId && !opts.some((o) => o.id === c.customerId)) {
        opts.push({ id: c.customerId, name: c.customerName });
      }
    }
    return opts;
  }, [customers, backlog]);

  const estimateOptions = useMemo(() => {
    const opts: EstimateOption[] = [...estimates];
    for (const c of backlog) {
      if (c.customerId && !opts.some((o) => o.id === c.id)) {
        opts.push({
          id: c.id,
          estimateNumber: c.estimateNumber,
          siteMeasure: { location: { customer: { id: c.customerId } } },
        });
      }
    }
    return opts;
  }, [estimates, backlog]);

  function openNewEvent(date: string, defaults?: EventFormDefaults) {
    setSelectedDate(date);
    setEditingEvent(null);
    setFormDefaults(defaults ?? null);
    setPanelOpen(true);
  }

  function openEditEvent(ev: CalEvent) {
    setEditingEvent(ev);
    setSelectedDate(ev.date.slice(0, 10));
    setPanelOpen(true);
  }

  function scheduleCandidate(c: SchedulableCandidate) {
    openNewEvent(today, {
      type: "job",
      title: `Install — ${c.customerName}`,
      customerId: c.customerId ?? undefined,
      estimateId: c.id,
    });
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
            Schedule Manager
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

      {/* Unscheduled-jobs backlog */}
      {canEdit && (
        <BacklogStrip candidates={backlog} onSchedule={scheduleCandidate} />
      )}

      {/* Crew filter bar */}
      <CrewFilterBar
        crew={crew.map((m) => ({ id: m.id, name: m.name }))}
        events={events}
        weekStart={weekStart ? dateStr(weekStart) : ""}
        days={daysToShow}
        active={crewFilter}
        onChange={setCrewFilter}
      />

      {/* Calendar — the header row and the day columns are cells of ONE CSS
          grid, so their column tracks are the same tracks and the dividers
          cannot drift out of alignment. That is the whole fix: any scrollbar
          (page or otherwise) now narrows header and body together, because it
          narrows the single grid. Deliberately NOT its own scroll container —
          the grid is a fixed BODY_HEIGHT that always fits, so an inner
          `overflow-y: auto` would never scroll while still swallowing the
          sticky context and reserving a permanently empty scrollbar gutter on
          classic-scrollbar platforms. The page (`<main>`) does the scrolling. */}
      <div
        className={cn(
          "bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden",
          crewFilter !== "all" && "cal-crew-focus"
        )}
      >
        <div
          className="grid pb-2"
          style={{
            gridTemplateColumns: `52px repeat(${daysToShow}, 1fr)`,
          }}
        >
          {/* Header row */}
          <div className="bg-[var(--surface-2)] border-b border-r border-[var(--line)] px-1.5 py-2 text-right">
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
                  "px-2.5 py-2 text-center border-b border-l border-[var(--line)] bg-[var(--surface)] transition-colors w-full",
                  canEdit && "cursor-pointer hover:bg-[var(--surface-2)]",
                  isToday && TODAY_HEADER_TINT
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

          {/* Time gutter */}
          <div
            className="relative border-r border-[var(--line)]"
            style={{ height: BODY_HEIGHT }}
          >
            {GRID_HOURS.map((hour) => (
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
          {days.map((d) => {
            const ds = dateStr(d);
            const isToday = ds === today;
            const dayEvents = eventsByDate[ds] ?? [];
            const placed = layoutDayEvents(dayEvents);
            const nowTop =
              isToday && nowMin !== null ? nowLineTop(nowMin) : null;

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
                style={{ height: BODY_HEIGHT }}
                onClick={(e) => {
                  if (!canEdit) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  openNewEvent(ds, slotFromOffsetY(e.clientY - rect.top));
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && canEdit && openNewEvent(ds)
                }
              >
                {/* Hour lines */}
                {GRID_HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-[var(--line)] pointer-events-none"
                    style={{ top: (hour - START_HOUR) * PX_PER_HOUR }}
                  />
                ))}
                {/* Half-hour lines */}
                {GRID_HOURS.slice(0, -1).map((hour) => (
                  <div
                    key={`${hour}-half`}
                    className="absolute left-0 right-0 border-t border-dashed border-[var(--line)] opacity-50 pointer-events-none"
                    style={{
                      top: (hour - START_HOUR) * PX_PER_HOUR + PX_PER_HOUR / 2,
                    }}
                  />
                ))}
                {/* Current-time line */}
                {nowTop !== null && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: nowTop }}
                  >
                    <div className="border-t-2 border-[var(--accent)]" />
                    <div className="absolute left-0 -top-[3px] w-[6px] h-[6px] rounded-full bg-[var(--accent)]" />
                  </div>
                )}
                {/* Events */}
                {placed.map(
                  ({
                    ev,
                    top,
                    height,
                    lane,
                    totalLanes,
                    clippedStart,
                    clippedEnd,
                  }) => {
                    const widthPct = 100 / totalLanes;
                    const leftPct = lane * widthPct;
                    const matches = eventMatchesCrew(ev, crewFilter);

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        title={`${ev.title} · ${ev.startTime}–${ev.endTime}`}
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
                          {clippedStart && "↑ "}
                          {clippedEnd && !clippedStart && "↓ "}
                          {ev.title}
                        </div>
                        {height > 30 && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-85 mt-0.5 whitespace-nowrap">
                            {ev.startTime}–{ev.endTime}
                          </div>
                        )}
                        {height > 46 && ev.assignees.length > 0 && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-75 mt-px flex items-center gap-1 truncate">
                            <span className="flex items-center gap-[2px] flex-shrink-0">
                              {ev.assignees.slice(0, 3).map((m) => (
                                <CrewAvatar
                                  key={m.id}
                                  name={m.name}
                                  size="sm"
                                />
                              ))}
                              {ev.assignees.length > 3 && (
                                <span className="ml-[2px]">
                                  +{ev.assignees.length - 3}
                                </span>
                              )}
                            </span>
                            <span className="truncate">
                              {ev.assignees.map((m) => m.name).join(" · ")}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <EventFormPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          defaultDate={selectedDate}
          defaults={formDefaults}
          editingEvent={editingEvent}
          customers={customerOptions}
          estimates={estimateOptions}
          onSave={async (data) => {
            try {
              if (editingEvent) {
                await updateEvent.mutateAsync(data);
              } else {
                await createEvent.mutateAsync(data);
              }
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
