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
  job: "bg-sage/20 border-sage text-sage",
  visit: "bg-gold/20 border-gold text-gold",
  other: "bg-driftwood/20 border-driftwood text-driftwood",
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
    events.forEach((ev) => {
      const d = ev.date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    });
    return map;
  }, [events]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between pb-3 border-b-2 border-oak">
        <div>
          <p className="font-[var(--font-label)] text-[11px] italic text-vermil mb-1">
            Week of{" "}
            {weekStart.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <h1 className="font-[var(--font-display)] text-[36px] font-black text-oak leading-none tracking-tight">
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
            className="grid border-[1.5px] border-oak"
            style={{ gridTemplateColumns: `56px repeat(${daysToShow}, 1fr)` }}
          >
            <div className="border-r border-oak" />
            {days.map((d) => {
              const ds = dateStr(d);
              return (
                <div
                  key={ds}
                  className={cn(
                    "px-2 py-1.5 border-r border-oak last:border-r-0 text-center cursor-pointer hover:bg-linen transition-colors",
                    ds === today && "bg-vermil/10"
                  )}
                  onClick={() => openNewEvent(ds)}
                >
                  <span
                    className={cn(
                      "font-[var(--font-mono)] text-[11px] uppercase tracking-wider",
                      ds === today ? "text-vermil font-bold" : "text-oak"
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
              className="grid border-x border-b border-oak"
              style={{ gridTemplateColumns: `56px repeat(${daysToShow}, 1fr)` }}
            >
              {/* Time label */}
              <div className="border-r border-oak px-2 py-1 flex items-start">
                <span className="font-[var(--font-mono)] text-[9px] text-driftwood">
                  {hour % 12 === 0 ? 12 : hour % 12}
                  {hour < 12 ? "a" : "p"}
                </span>
              </div>

              {/* Day cells */}
              {days.map((d) => {
                const ds = dateStr(d);
                const cellEvents = (eventsByDate[ds] ?? []).filter((ev) => {
                  const start = timeToMinutes(ev.startTime);
                  return start >= hour * 60 && start < (hour + 1) * 60;
                });

                return (
                  <div
                    key={ds}
                    className="border-r border-oak last:border-r-0 min-h-[44px] p-0.5 cursor-pointer hover:bg-linen/50 transition-colors"
                    onClick={() => openNewEvent(ds)}
                  >
                    {cellEvents.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditEvent(ev);
                        }}
                        className={cn(
                          "w-full text-left px-1.5 py-1 border-l-2 mb-0.5",
                          "font-[var(--font-mono)] text-[9px] leading-tight",
                          EVENT_COLORS[ev.type] ?? EVENT_COLORS.other
                        )}
                      >
                        <div className="font-medium truncate">{ev.title}</div>
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

      {/* Event panel */}
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

// ── Event form panel ──────────────────────────────────────────────────────

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

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={ev ? "Edit Event" : "New Event"}
    >
      <div className="space-y-4">
        {/* Type */}
        <div>
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood block mb-2">
            Type
          </label>
          <div className="flex gap-1.5">
            {(["job", "visit", "other"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 min-h-[44px] px-3 font-[var(--font-mono)] text-[10px] uppercase tracking-wider border",
                  type === t
                    ? "bg-oak border-oak text-linen"
                    : "bg-linen border-sand text-driftwood hover:border-oak"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
          />
        </div>

        {/* Date & Times */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-[1.5px] border-oak bg-linen px-2 py-1.5 font-[var(--font-mono)] text-xs text-oak focus:outline-none focus:border-vermil"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
              Start
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="border-[1.5px] border-oak bg-linen px-2 py-1.5 font-[var(--font-mono)] text-xs text-oak focus:outline-none focus:border-vermil"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
              End
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="border-[1.5px] border-oak bg-linen px-2 py-1.5 font-[var(--font-mono)] text-xs text-oak focus:outline-none focus:border-vermil"
            />
          </div>
        </div>

        {/* Customer */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Customer
          </label>
          <select
            value={customerId ?? ""}
            onChange={(e) =>
              setCustomerId(
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
          >
            <option value="">— None —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Crew */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Crew
          </label>
          <input
            type="text"
            value={crew}
            onChange={(e) => setCrew(e.target.value)}
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Notes
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil resize-none"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 justify-center"
          >
            {saving ? "Saving…" : ev ? "Update" : "Create Event"}
          </Button>
          <Button onClick={onClose} className="flex-1 justify-center">
            Cancel
          </Button>
        </div>

        {ev && (
          <button
            onClick={() => onDelete(ev.id)}
            className="w-full min-h-[44px] font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-vermil hover:bg-vermil/5 border border-vermil/30 transition-colors"
          >
            Delete event
          </button>
        )}
      </div>
    </SlidePanel>
  );
}
