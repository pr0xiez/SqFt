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
  fmtDayHead,
  getWeekStart,
  timeToMinutes,
  todayStr,
} from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am–6pm

const EVENT_COLORS: Record<string, string> = {
  job: "bg-[var(--sage)]/15   border-[var(--sage)]   text-[var(--sage)]",
  visit: "bg-[var(--gold)]/15   border-[var(--gold)]   text-[var(--gold)]",
  other: "bg-[var(--muted)]/10  border-[var(--muted)]  text-[var(--muted)]",
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
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
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
        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className={cn(isMobile ? "" : "min-w-[600px]")}>
          {/* Day headers */}
          <div
            className="grid border border-[var(--line)] bg-[var(--surface-2)]"
            style={{ gridTemplateColumns: `56px repeat(${daysToShow}, 1fr)` }}
          >
            <div className="border-r border-[var(--line)]" />
            {days.map((d) => {
              const ds = dateStr(d);
              return (
                <div
                  key={ds}
                  className={cn(
                    "px-2 py-1.5 border-r border-[var(--line)] last:border-r-0 text-center cursor-pointer transition-colors hover:bg-[var(--surface)]",
                    ds === today && "bg-[var(--accent)]/8"
                  )}
                  onClick={() => openNewEvent(ds)}
                >
                  <span
                    className={cn(
                      "font-[var(--font-mono)] text-[11px] uppercase tracking-[.04em]",
                      ds === today
                        ? "text-[var(--accent)] font-[600]"
                        : "text-[var(--ink-2)]"
                    )}
                  >
                    {fmtDayHead(d)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Time rows */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid border-x border-b border-[var(--line)]"
              style={{ gridTemplateColumns: `56px repeat(${daysToShow}, 1fr)` }}
            >
              <div className="border-r border-[var(--line)] px-2 py-1 flex items-start">
                <span className="font-[var(--font-mono)] text-[9px] text-[var(--muted)]">
                  {hour % 12 === 0 ? 12 : hour % 12}
                  {hour < 12 ? "a" : "p"}
                </span>
              </div>

              {days.map((d) => {
                const ds = dateStr(d);
                const cellEvents = (eventsByDate[ds] ?? []).filter((ev) => {
                  const start = timeToMinutes(ev.startTime);
                  return start >= hour * 60 && start < (hour + 1) * 60;
                });

                return (
                  <div
                    key={ds}
                    className="border-r border-[var(--line)] last:border-r-0 min-h-[44px] p-0.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    onClick={() => openNewEvent(ds)}
                  >
                    {cellEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditEvent(ev);
                        }}
                        className={cn(
                          "w-full text-left px-1.5 py-1 border-l-2 mb-0.5 rounded-[3px]",
                          "font-[var(--font-mono)] text-[9px] leading-tight",
                          EVENT_COLORS[ev.type] ?? EVENT_COLORS.other
                        )}
                      >
                        <div className="font-[500] truncate">{ev.title}</div>
                        <div className="opacity-70">
                          {ev.startTime}–{ev.endTime}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
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
    "border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]";
  const labelClass =
    "font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]";

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
                  "flex-1 min-h-[36px] px-3 font-[var(--font-mono)] text-[10px] tracking-[.02em]",
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
            className="w-full min-h-[36px] font-[var(--font-mono)] text-[10px] tracking-[.02em] text-[var(--accent)] hover:bg-[var(--accent)]/5 border border-[var(--accent)]/30 rounded-[6px] transition-colors"
          >
            Delete event
          </button>
        )}
      </div>
    </SlidePanel>
  );
}
