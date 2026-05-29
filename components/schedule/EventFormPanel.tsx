"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { cn } from "@/lib/cn";
import { useCrewMembers } from "@/lib/hooks/useCrewMembers";
import type { CalEvent, CreateEventInput } from "@/lib/hooks/useEvents";

interface EstimateOption {
  id: number;
  estimateNumber: number;
  siteMeasure: {
    title: string;
    location?: { customer?: { id: number } | null } | null | undefined;
  };
}

interface EventFormPanelProps {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  editingEvent: CalEvent | null;
  customers: { id: number; name: string }[];
  estimates: EstimateOption[];
  onSave: (data: CreateEventInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const inputClass =
  "w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150";
const labelClass =
  "font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]";

export function EventFormPanel({
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
  const [endDate, setEndDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [estimateId, setEstimateId] = useState<number | undefined>();
  const [crewMemberIds, setCrewMemberIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: crew = [], isLoading: crewLoading } = useCrewMembers();

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
      setCrewMemberIds(new Set((ev.crewMembers ?? []).map((m) => m.id)));
      setNotes(ev.notes ?? "");
    } else {
      setType("visit");
      setTitle("");
      setDate(defaultDate);
      setEndDate(defaultDate);
      setStartTime("08:00");
      setEndTime("09:00");
      setCustomerId(undefined);
      setEstimateId(undefined);
      setCrewMemberIds(new Set());
      setNotes("");
    }
  }, [open, ev, defaultDate]);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        type,
        title,
        date,
        ...(endDate > date ? { endDate } : {}),
        startTime,
        endTime,
        customerId,
        estimateId,
        crewMemberIds: Array.from(crewMemberIds),
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
            onChange={(e) => {
              setCustomerId(
                e.target.value ? parseInt(e.target.value, 10) : undefined
              );
              setEstimateId(undefined);
            }}
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
            <select
              value={estimateId ?? ""}
              onChange={(e) =>
                setEstimateId(
                  e.target.value ? parseInt(e.target.value, 10) : undefined
                )
              }
              className={inputClass}
              disabled={!customerId}
            >
              {!customerId ? (
                <option value="">— Pick a customer first —</option>
              ) : customerEstimates.length === 0 ? (
                <option value="">— No estimates for this customer —</option>
              ) : (
                <>
                  <option value="">— Select estimate —</option>
                  {customerEstimates.map((q) => (
                    <option key={q.id} value={q.id}>
                      Estimate #{q.estimateNumber}
                      {q.siteMeasure.title ? ` — ${q.siteMeasure.title}` : ""}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        )}

        {/* Date / End Date */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className={labelClass}>Start Date</div>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <div className={labelClass}>End Date</div>
            <input
              type="date"
              value={endDate}
              min={date}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
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
          <div className={labelClass}>
            Crew{" "}
            <span className="text-[var(--muted)] font-[400] normal-case tracking-normal">
              (tap to assign — multiple OK)
            </span>
          </div>
          {crewLoading ? (
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[36px] rounded-[6px] bg-[var(--surface-2)] animate-pulse"
                />
              ))}
            </div>
          ) : crew.length === 0 ? (
            <div className="text-[12px] text-[var(--muted)]">
              No crew yet.{" "}
              <Link href="/crew" className="underline hover:text-[var(--ink)]">
                Add crew members →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {crew.map((m) => {
                const active = crewMemberIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      const next = new Set(crewMemberIds);
                      if (active) next.delete(m.id);
                      else next.add(m.id);
                      setCrewMemberIds(next);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 px-2.5 py-2 rounded-[6px]",
                      "text-[13px] font-[500] tracking-[-0.005em] text-left transition-[background,border-color] duration-150",
                      "border",
                      active
                        ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                        : "bg-[var(--surface)] text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]"
                    )}
                  >
                    <CrewAvatar name={m.name} size="lg" />
                    <span className="truncate">{m.name}</span>
                    {active && (
                      <span className="ml-auto text-[12px] font-[600]">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-2 tracking-[0.02em]">
            {crewMemberIds.size === 0
              ? "No crew assigned"
              : `${crewMemberIds.size} assigned`}
          </div>
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
