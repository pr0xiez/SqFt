"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import {
  type CalEvent,
  type CreateEventInput,
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

export function ScheduleView() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);

  const isMobile = useIsMobile();
  const daysToShow = isMobile ? 3 : 6;

  const { data: events = [] } = useEvents();
  const { data: customers = [] } = useCustomers();
  const { data: estimates = [] } = useEstimates();
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();
  const { showToast } = useToast();

  const days = useMemo(
    () => Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i)),
    [weekStart, daysToShow]
  );

  const [today, setToday] = useState("");

  useEffect(() => {
    const t = todayStr();
    setToday(t);
    setSelectedDate(t);
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
      const d = ev.date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [events]);

  const weekLabel = `Week of ${days[0]?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${days[days.length - 1]?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${days[days.length - 1]?.getFullYear()}`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            SqFt · Flooring Estimates
          </div>
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
            onClick={() => setWeekStart((d) => addDays(d, -daysToShow))}
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
            onClick={() => setWeekStart((d) => addDays(d, daysToShow))}
          >
            →
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => openNewEvent(today)}
          >
            + Add Event
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
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
              <div
                key={ds}
                className={cn(
                  "px-2.5 py-2 text-center border-l border-[var(--line)] bg-[var(--surface)] cursor-pointer hover:bg-[var(--surface-2)] transition-colors",
                  isToday &&
                    "bg-[rgba(192,52,26,0.04)] [html[data-theme=dark]_&]:bg-[rgba(255,106,68,0.06)]"
                )}
                onClick={() => openNewEvent(ds)}
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
              </div>
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
                <div
                  key={ds}
                  className={cn(
                    "relative border-l border-[var(--line)] cursor-pointer",
                    isToday &&
                      "bg-[rgba(192,52,26,0.02)] [html[data-theme=dark]_&]:bg-[rgba(255,106,68,0.04)]"
                  )}
                  style={{ minHeight: BODY_HEIGHT }}
                  onClick={() => openNewEvent(ds)}
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

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditEvent(ev);
                        }}
                        style={{
                          position: "absolute",
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                        className={cn(
                          "rounded-[4px] px-[7px] py-[5px] text-left text-white overflow-hidden cursor-pointer border-l-[3px] border-l-black/20 transition-[filter,box-shadow] duration-[120ms] hover:brightness-105 hover:z-10 hover:shadow-[var(--shadow)]",
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
                        {height > 46 && ev.crew && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-75 mt-px">
                            {ev.crew}
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
    </div>
  );
}

interface EventFormPanelProps {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  editingEvent: CalEvent | null;
  customers: { id: number; name: string }[];
  estimates: { id: number; customerId: number | null }[];
  onSave: (data: CreateEventInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function EventFormPanel({
  open,
  onClose,
  defaultDate,
  editingEvent,
  customers,
  estimates,
  onSave,
  onDelete,
}: EventFormPanelProps) {
  const [type, setType] = useState<"job" | "visit" | "other">("visit");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [crew, setCrew] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const ev = editingEvent;
  const customerEstimates = customerId
    ? estimates.filter((e) => e.customerId === customerId)
    : [];

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        type,
        title,
        date,
        startTime,
        endTime,
        customerId,
        crew,
        notes,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150";
  const labelClass =
    "font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]";

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={ev ? "Edit Event" : "New Event"}
      sub={ev ? "Update details" : "Add to schedule"}
      footer={
        <>
          {ev && (
            <Button onClick={() => onDelete(ev.id)} className="justify-center">
              Delete
            </Button>
          )}
          <Button onClick={onClose} className="flex-1 justify-center">
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 justify-center"
          >
            {saving ? "Saving…" : ev ? "Update" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Type selector */}
        <div className="grid grid-cols-3 gap-px bg-[var(--line)] border border-[var(--line)] rounded-[5px] overflow-hidden mb-4">
          {(["visit", "job", "other"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "py-2 px-1 font-[var(--font-mono)] text-[9px] tracking-[.04em] uppercase cursor-pointer transition-colors duration-150 border-none",
                type === t
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "bg-[var(--surface)] text-[var(--muted)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Title */}
        <div className="mb-4">
          <div className={labelClass}>Title</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Customer */}
        <div className="mb-4">
          <div className={labelClass}>
            Customer{" "}
            {type !== "other" && (
              <span className="text-[var(--accent)]">*</span>
            )}
            {type === "other" && (
              <span className="text-[var(--muted)] font-[400]">(optional)</span>
            )}
          </div>
          <select
            value={customerId ?? ""}
            onChange={(e) =>
              setCustomerId(
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            className={inputClass}
          >
            <option value="">
              {type === "other" ? "— No customer —" : "— Select customer —"}
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Estimate (only for jobs) */}
        {type === "job" && (
          <div className="mb-4">
            <div className={labelClass}>
              Estimate <span className="text-[var(--accent)]">*</span>
            </div>
            <select className={inputClass} disabled={!customerId}>
              {!customerId ? (
                <option value="" disabled>
                  — Pick a customer first —
                </option>
              ) : customerEstimates.length === 0 ? (
                <option value="" disabled>
                  — No estimates for this customer —
                </option>
              ) : (
                <>
                  <option value="" disabled>
                    — Select estimate —
                  </option>
                  {customerEstimates.map((e) => (
                    <option key={e.id} value={e.id}>
                      #{e.id}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        )}

        {/* Date */}
        <div className="mb-4">
          <div className={labelClass}>Date</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Start / End */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className={labelClass}>Start</div>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <div className={labelClass}>End</div>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Crew */}
        <div className="mb-4">
          <div className={labelClass}>Crew</div>
          <select
            value={crew}
            onChange={(e) => setCrew(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="Mike">Mike</option>
            <option value="Carlos">Carlos</option>
            <option value="Dave">Dave</option>
            <option value="Sarah">Sarah</option>
          </select>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <div className={labelClass}>Notes</div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
    </SlidePanel>
  );
}
