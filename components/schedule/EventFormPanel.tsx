"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { CheckIcon } from "@/components/ui/icons";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { cn } from "@/lib/cn";
import { useAssignableUsers } from "@/lib/hooks/useAssignableUsers";
import type { CalEvent, CreateEventInput } from "@/lib/hooks/useEvents";
import { timeToMinutes } from "@/lib/utils";

export interface EstimateOption {
  id: number;
  estimateNumber: number;
  siteMeasure: {
    location?: { customer?: { id: number } | null } | null | undefined;
  };
}

/** Seed values for a new event (backlog scheduling, click-on-a-time-slot). */
export interface EventFormDefaults {
  type?: "job" | "visit" | "other";
  title?: string;
  customerId?: number;
  estimateId?: number;
  startTime?: string;
  endTime?: string;
}

interface EventFormPanelProps {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  defaults?: EventFormDefaults | null;
  editingEvent: CalEvent | null;
  customers: { id: number; name: string }[];
  estimates: EstimateOption[];
  onSave: (data: CreateEventInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function EventFormPanel({
  open,
  onClose,
  defaultDate,
  defaults,
  editingEvent,
  customers,
  estimates,
  onSave,
  onDelete,
}: EventFormPanelProps) {
  const [type, setType] = useState<"job" | "visit" | "other">("visit");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [estimateId, setEstimateId] = useState<number | undefined>();
  const [crewMemberIds, setCrewMemberIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: crew = [], isLoading: crewLoading } = useAssignableUsers();
  const fid = useId();

  const ev = editingEvent;
  const customerEstimates = useMemo(
    () =>
      customerId
        ? estimates.filter(
            (q) => q.siteMeasure.location?.customer?.id === customerId
          )
        : [],
    [customerId, estimates]
  );

  useEffect(() => {
    if (!open) return;
    if (ev) {
      setType(ev.type);
      setTitle(ev.title);
      setDate(ev.date.slice(0, 10));
      setEndDate((ev.endDate ?? ev.date).slice(0, 10));
      setStartTime(ev.startTime);
      setEndTime(ev.endTime);
      setCustomerId(ev.customerId ?? undefined);
      setEstimateId(ev.estimateId ?? undefined);
      setCrewMemberIds(new Set((ev.assignees ?? []).map((m) => m.id)));
      setNotes(ev.notes ?? "");
    } else {
      setType(defaults?.type ?? "visit");
      setTitle(defaults?.title ?? "");
      setDate(defaultDate);
      setEndDate(defaultDate);
      setStartTime(defaults?.startTime ?? "08:00");
      setEndTime(defaults?.endTime ?? "09:00");
      setCustomerId(defaults?.customerId);
      setEstimateId(defaults?.estimateId);
      setCrewMemberIds(new Set());
      setNotes("");
    }
  }, [open, ev, defaultDate, defaults]);

  // Same-day events must end after they start; multi-day events may wrap past
  // midnight. Mirrors the zod refine in lib/events/schema.ts.
  const timeInvalid =
    endDate <= date && timeToMinutes(endTime) <= timeToMinutes(startTime);
  // The server rejects a job without an estimate (eventRepo); block it here
  // instead of round-tripping a 400.
  const missingEstimate = type === "job" && !estimateId;
  const canSave = title.trim().length > 0 && !timeInvalid && !missingEstimate;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        type,
        title,
        date,
        // On update, an omitted endDate would leave a stale multi-day span in
        // place — send null to clear it back to single-day.
        ...(endDate > date ? { endDate } : ev ? { endDate: null } : {}),
        startTime,
        endTime,
        customerId,
        estimateId,
        assigneeIds: Array.from(crewMemberIds),
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
      sub={ev ? "Update details" : "Add to schedule"}
      footer={
        <>
          {ev && (
            <Button variant="danger" onClick={() => onDelete(ev.id)}>
              Delete
            </Button>
          )}
          <Button onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1"
          >
            {saving ? "Saving…" : ev ? "Update" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Type selector */}
        <div className="seg w-full flex">
          {(["visit", "job", "other"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className="flex-1 min-h-[34px] capitalize"
            >
              {t}
            </button>
          ))}
        </div>

        {/* Title */}
        <div>
          <label htmlFor={`${fid}-title`} className="field-label">
            Title
          </label>
          <input
            id={`${fid}-title`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field"
          />
        </div>

        {/* Customer */}
        <div>
          <label htmlFor={`${fid}-customer`} className="field-label">
            Customer{" "}
            {type !== "other" && (
              <span className="text-[var(--accent-ink)]">*</span>
            )}
            {type === "other" && (
              <span className="text-[var(--muted)] font-[400]">(optional)</span>
            )}
          </label>
          <select
            id={`${fid}-customer`}
            value={customerId ?? ""}
            onChange={(e) => {
              setCustomerId(
                e.target.value ? parseInt(e.target.value, 10) : undefined
              );
              setEstimateId(undefined);
            }}
            className="field"
          >
            <option value="">
              {type === "other" ? "No customer" : "Select customer"}
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
          <div>
            <label htmlFor={`${fid}-estimate`} className="field-label">
              Estimate <span className="text-[var(--accent-ink)]">*</span>
            </label>
            <select
              id={`${fid}-estimate`}
              value={estimateId ?? ""}
              onChange={(e) =>
                setEstimateId(
                  e.target.value ? parseInt(e.target.value, 10) : undefined
                )
              }
              className="field"
              disabled={!customerId}
            >
              {!customerId ? (
                <option value="">Pick a customer first</option>
              ) : customerEstimates.length === 0 ? (
                <option value="">No estimates for this customer</option>
              ) : (
                <>
                  <option value="">Select estimate</option>
                  {customerEstimates.map((q) => (
                    <option key={q.id} value={q.id}>
                      Estimate #{q.estimateNumber}
                    </option>
                  ))}
                </>
              )}
            </select>
            {missingEstimate && customerId && customerEstimates.length > 0 && (
              <div className="field-hint">
                Select the estimate this job is for.
              </div>
            )}
          </div>
        )}

        {/* Date / End Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${fid}-date`} className="field-label">
              Start Date
            </label>
            <input
              id={`${fid}-date`}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="field type-figure"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${fid}-end-date`} className="field-label">
              End Date
            </label>
            <input
              id={`${fid}-end-date`}
              type="date"
              value={endDate}
              min={date}
              onChange={(e) => setEndDate(e.target.value)}
              className="field type-figure"
            />
          </div>
        </div>

        {/* Start / End */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${fid}-start`} className="field-label">
              Start
            </label>
            <input
              id={`${fid}-start`}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-invalid={timeInvalid || undefined}
              className="field type-figure"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${fid}-end`} className="field-label">
              End
            </label>
            <input
              id={`${fid}-end`}
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-invalid={timeInvalid || undefined}
              className="field type-figure"
            />
          </div>
          {timeInvalid && (
            <div className="col-span-2 field-error -mt-1.5">
              End time must be after start time.
            </div>
          )}
        </div>

        {/* Crew */}
        <div>
          <div className="field-label">
            Crew{" "}
            <span className="text-[var(--muted)] font-[400]">
              (tap to assign, multiple OK)
            </span>
          </div>
          {crewLoading ? (
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 rounded-[var(--r)] bg-[var(--surface-2)] animate-pulse"
                />
              ))}
            </div>
          ) : crew.length === 0 ? (
            <div className="text-[13.5px] text-[var(--muted)]">
              No people to assign yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {crew.map((m) => {
                const active = crewMemberIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const next = new Set(crewMemberIds);
                      if (active) next.delete(m.id);
                      else next.add(m.id);
                      setCrewMemberIds(next);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 min-h-10 px-2.5 rounded-[var(--r)] min-w-0",
                      "text-[14px] font-[560] text-left cursor-pointer border",
                      "transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease)] active:scale-[0.98]",
                      active
                        ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                        : "bg-transparent text-[var(--ink-2)] border-[var(--line-2)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
                    )}
                  >
                    <CrewAvatar
                      name={m.name}
                      size="lg"
                      className={active ? "ring-1 ring-[var(--bg)]" : undefined}
                    />
                    <span className="truncate">{m.name}</span>
                    {active && (
                      <CheckIcon
                        aria-hidden="true"
                        weight="bold"
                        className="ml-auto size-4 shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="field-hint">
            {crewMemberIds.size === 0
              ? "No crew assigned"
              : `${crewMemberIds.size} assigned`}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor={`${fid}-notes`} className="field-label">
            Notes
          </label>
          <textarea
            id={`${fid}-notes`}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field resize-none"
          />
        </div>
      </div>
    </SlidePanel>
  );
}
