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
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
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

// Event blocks: an opaque surface with the type tint layered on top, so the
// hour lines never show through, and a 3px type-coloured left edge.
const EVENT_BLOCK: Record<string, string> = {
  job: "[background-image:linear-gradient(var(--accent-wash),var(--accent-wash))] border-l-[var(--accent)]",
  visit:
    "[background-image:linear-gradient(color-mix(in_oklab,var(--warn)_16%,transparent),color-mix(in_oklab,var(--warn)_16%,transparent))] border-l-[var(--warn)]",
  other: "bg-[var(--surface-2)] border-l-[var(--line-2)]",
};

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

  // `?date=YYYY-MM-DD` (links from an estimate's or customer's schedule)
  // opens on that day's week; otherwise this week.
  useEffect(() => {
    const t = todayStr();
    setToday(t);
    const param = new URLSearchParams(window.location.search).get("date");
    const focus = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : t;
    setSelectedDate(focus);
    // Phones show three days from the start, so open on the day itself.
    const day = new Date(`${focus}T12:00:00`);
    const narrow =
      param !== null &&
      (window.matchMedia?.("(max-width: 767px)").matches ?? false);
    setWeekStart(
      param && narrow ? new Date(day.setHours(0, 0, 0, 0)) : getWeekStart(day)
    );
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
      title: `Install: ${c.customerName}`,
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
      ? `Week of ${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${days[days.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${days[days.length - 1].getFullYear()}`
      : "";

  return (
    <div>
      <PageHeader
        title="Schedule Manager"
        meta={weekLabel || null}
        actions={
          <>
            <Button
              size="icon-sm"
              aria-label="Previous week"
              onClick={() =>
                setWeekStart((d) => (d ? addDays(d, -daysToShow) : d))
              }
            >
              <CaretLeftIcon aria-hidden="true" weight="bold" />
            </Button>
            <Button
              size="sm"
              onClick={() => setWeekStart(getWeekStart(new Date()))}
            >
              Today
            </Button>
            <Button
              size="icon-sm"
              aria-label="Next week"
              onClick={() =>
                setWeekStart((d) => (d ? addDays(d, daysToShow) : d))
              }
            >
              <CaretRightIcon aria-hidden="true" weight="bold" />
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => openNewEvent(today)}
              >
                <PlusIcon aria-hidden="true" />
                Add Event
              </Button>
            )}
          </>
        }
      />

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
          "card overflow-hidden",
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
          <div className="border-b border-r border-[var(--line)] px-1.5 py-2 text-right">
            <span className="text-[12px] font-[500] text-[var(--muted)]">
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
                  "px-2 py-2 text-center border-b border-l border-[var(--line)] transition-colors w-full",
                  canEdit && "cursor-pointer hover:bg-[var(--hover)]"
                )}
                onClick={() => canEdit && openNewEvent(ds)}
              >
                <div
                  className={cn(
                    "text-[12.5px] font-[500] mb-0.5",
                    isToday ? "text-[var(--accent-ink)]" : "text-[var(--muted)]"
                  )}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={cn(
                    "type-figure text-[18px] font-[600] leading-tight",
                    isToday ? "text-[var(--accent-ink)]" : "text-[var(--ink)]"
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
                className={cn(
                  "absolute right-2 type-figure text-[12px] leading-none text-[var(--muted)]",
                  hour === START_HOUR ? "translate-y-1" : "-translate-y-1/2"
                )}
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
                    "bg-[color-mix(in_oklab,var(--accent)_3%,transparent)]"
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
                    <div className="absolute -left-[4px] -top-[3px] size-2 rounded-full bg-[var(--accent)]" />
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
                        title={`${ev.title} · ${ev.startTime}-${ev.endTime}`}
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
                          "rounded-[var(--r-in)] px-[7px] py-[5px] text-left text-[var(--ink)] bg-[var(--surface)] overflow-hidden cursor-pointer border-l-[3px] transition-[opacity,outline-color] duration-[120ms] outline outline-1 outline-transparent -outline-offset-1 hover:outline-[var(--line-2)] hover:z-10",
                          EVENT_BLOCK[ev.type] ?? EVENT_BLOCK.other
                        )}
                      >
                        <div className="flex items-center gap-1 text-[12.5px] font-[600] leading-[1.2] tracking-[-0.01em]">
                          {clippedStart && (
                            <ArrowUpIcon
                              aria-hidden="true"
                              className="size-3 shrink-0 text-[var(--muted)]"
                            />
                          )}
                          {clippedEnd && !clippedStart && (
                            <ArrowDownIcon
                              aria-hidden="true"
                              className="size-3 shrink-0 text-[var(--muted)]"
                            />
                          )}
                          <span className="truncate">{ev.title}</span>
                        </div>
                        {height > 30 && (
                          <div className="type-figure text-[12px] text-[var(--ink-2)] mt-0.5 whitespace-nowrap truncate">
                            {ev.startTime}-{ev.endTime}
                          </div>
                        )}
                        {height > 46 && ev.assignees.length > 0 && (
                          <div className="text-[12px] text-[var(--muted)] mt-0.5 truncate">
                            {ev.assignees.map((m) => m.name).join(" · ")}
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
            } catch (error) {
              showToast(
                error instanceof Error
                  ? error.message
                  : "Failed to delete event"
              );
            }
          }}
        />
      )}
    </div>
  );
}
