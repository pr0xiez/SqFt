"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useCustomers } from "@/lib/hooks/useCustomers";
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

const BODY_HEIGHT = 680;
const START_HOUR = 7;
const END_HOUR = 19;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
const PX_PER_MIN = BODY_HEIGHT / TOTAL_MINUTES;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => i + START_HOUR
);

const EVENT_COLORS: Record<string, string> = {
  job: "bg-[var(--accent)] text-white",
  visit: "bg-[var(--gold)] text-white",
  other: "bg-[var(--sage)] text-white",
};

export function ScheduleView() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);

  const isMobile = useIsMobile();
  const daysToShow = isMobile ? 3 : 6;

  const { data: events = [] } = useEvents();
  const { data: customers = [] } = useCustomers();
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();
  const { showToast } = useToast();

  const days = useMemo(
    () => Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i)),
    [weekStart, daysToShow]
  );

  const today = todayStr();

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between pb-4 border-b border-[var(--line)]">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] font-[500] text-[var(--muted)] tracking-[.04em] mb-1.5">
            Week of{" "}
            {weekStart.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <h1 className="font-[var(--font-display)] text-[36px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
            Schedule
          </h1>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            size="sm"
            onClick={() => setWeekStart(getWeekStart(new Date()))}
          >
            Today
          </Button>
          <Button
            size="sm"
            onClick={() => setWeekStart((d) => addDays(d, -daysToShow))}
          >
            ←
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

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className={cn(isMobile ? "" : "min-w-[600px]")}>
          {/* Day headers */}
          <div
            className="grid border border-b-0 border-[var(--line)] bg-[var(--surface-2)]"
            style={{ gridTemplateColumns: `52px repeat(${daysToShow}, 1fr)` }}
          >
            <div className="border-r border-[var(--line)]" />
            {days.map((d) => {
              const ds = dateStr(d);
              const isToday = ds === today;
              return (
                <div
                  key={ds}
                  className="px-2 py-2 border-r last:border-r-0 border-[var(--line)] text-center cursor-pointer hover:bg-[var(--surface)] transition-colors"
                  onClick={() => openNewEvent(ds)}
                >
                  <div className="font-[var(--font-mono)] text-[9px] font-[500] uppercase tracking-[.04em] text-[var(--ink-2)]">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div
                    className={cn(
                      "font-[var(--font-display)] text-[18px] font-[600] leading-tight tracking-[-0.01em]",
                      isToday ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    )}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrollable body */}
          <div
            className="flex border border-[var(--line)]"
            style={{ height: BODY_HEIGHT, overflowY: "auto" }}
          >
            {/* Time gutter */}
            <div
              className="relative shrink-0 border-r border-[var(--line)]"
              style={{ width: 52 }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex justify-end pr-1.5"
                  style={{ top: (hour - START_HOUR) * 60 * PX_PER_MIN }}
                >
                  <span className="font-[var(--font-mono)] text-[9px] font-[500] text-[var(--muted)] tracking-[.04em] -translate-y-1/2">
                    {hour % 12 === 0 ? 12 : hour % 12}
                    {hour < 12 ? "a" : "p"}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            <div
              className="grid flex-1"
              style={{ gridTemplateColumns: `repeat(${daysToShow}, 1fr)` }}
            >
              {days.map((d) => {
                const ds = dateStr(d);
                const dayEvents = eventsByDate[ds] ?? [];
                return (
                  <div
                    key={ds}
                    className="relative border-r last:border-r-0 border-[var(--line)] cursor-pointer"
                    style={{ minHeight: BODY_HEIGHT }}
                    onClick={() => openNewEvent(ds)}
                  >
                    {/* Hour lines */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 border-t border-[var(--line)]"
                        style={{ top: (hour - START_HOUR) * 60 * PX_PER_MIN }}
                      />
                    ))}
                    {/* Half-hour lines */}
                    {HOURS.map((hour) => (
                      <div
                        key={`${hour}-half`}
                        className="absolute left-0 right-0 border-t border-dashed border-[var(--line)] opacity-50"
                        style={{
                          top: ((hour - START_HOUR) * 60 + 30) * PX_PER_MIN,
                        }}
                      />
                    ))}
                    {/* Events */}
                    {dayEvents.map((ev) => {
                      const startMin =
                        timeToMinutes(ev.startTime) - START_HOUR * 60;
                      const endMin =
                        timeToMinutes(ev.endTime) - START_HOUR * 60;
                      const top = startMin * PX_PER_MIN;
                      const height = Math.max(
                        (endMin - startMin) * PX_PER_MIN,
                        20
                      );
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
                            left: 2,
                            right: 2,
                          }}
                          className={cn(
                            "rounded-[3px] px-1.5 py-1 text-left overflow-hidden",
                            EVENT_COLORS[ev.type] ?? EVENT_COLORS.other
                          )}
                        >
                          <div className="font-[var(--font-mono)] text-[9px] font-[500] truncate leading-tight">
                            {ev.title}
                          </div>
                          {height > 30 && (
                            <div className="font-[var(--font-mono)] text-[8px] font-[500] tracking-[.04em] opacity-80">
                              {ev.startTime}–{ev.endTime}
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
      </div>

      <EventFormPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        defaultDate={selectedDate}
        editingEvent={editingEvent}
        customers={customers}
        onSave={async (data) => {
          try {
            await createEvent.mutateAsync(data);
            setPanelOpen(false);
            showToast("Event saved.");
          } catch {
            showToast("Failed to save event.");
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteEvent.mutateAsync(id);
            setPanelOpen(false);
            showToast("Event deleted.");
          } catch {
            showToast("Failed to delete event.");
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
  onSave: (data: CreateEventInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function EventFormPanel({
  open,
  onClose,
  defaultDate,
  editingEvent,
  customers,
  onSave,
  onDelete,
}: EventFormPanelProps) {
  const [type, setType] = useState<"job" | "visit" | "other">("job");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [crew, setCrew] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const ev = editingEvent;

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
    "border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] font-[500] text-[var(--ink)] tracking-[.04em] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]";
  const labelClass =
    "font-[var(--font-mono)] text-[10px] font-[500] uppercase tracking-[.06em] text-[var(--muted)]";

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={ev ? "Edit event" : "New event"}
    >
      <div className="space-y-4">
        {/* Type */}
        <div>
          <label className={`${labelClass} block mb-2`}>Type</label>
          <div className="flex gap-1.5">
            {(["job", "visit", "other"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 min-h-[36px] px-3 font-[var(--font-mono)] text-[10px] font-[500] tracking-[.02em]",
                  "border rounded-[6px] transition-[background,border-color,color] duration-[150ms]",
                  type === t
                    ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)]"
                    : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Customer</label>
          <select
            value={customerId ?? ""}
            onChange={(e) =>
              setCustomerId(
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            className={inputClass}
          >
            <option value="">— None —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Crew</label>
          <input
            type="text"
            value={crew}
            onChange={(e) => setCrew(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 justify-center"
          >
            {saving ? "Saving…" : ev ? "Update" : "Create event"}
          </Button>
          <Button onClick={onClose} className="flex-1 justify-center">
            Cancel
          </Button>
        </div>

        {ev && (
          <button
            type="button"
            onClick={() => onDelete(ev.id)}
            className="w-full min-h-[36px] font-[var(--font-mono)] text-[10px] font-[500] tracking-[.02em] text-[var(--accent)] hover:bg-[var(--accent)]/5 border border-[var(--accent)]/30 rounded-[6px] transition-colors"
          >
            Delete event
          </button>
        )}
      </div>
    </SlidePanel>
  );
}
