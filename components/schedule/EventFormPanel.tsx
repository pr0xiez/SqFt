"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { cn } from "@/lib/cn";
import { useAssignableUsers } from "@/lib/hooks/useAssignableUsers";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useEstimates } from "@/lib/hooks/useEstimates";
import type { CalEvent, CreateEventInput } from "@/lib/hooks/useEvents";
import { isTruncated, withSelectedOption } from "@/lib/schedule/pickerOptions";
import { timeToMinutes } from "@/lib/utils";

/** Rows requested per picker query; a truncation hint shows past this. */
export const PICKER_PAGE_SIZE = 50;

/** Seed values for a new event (backlog scheduling, click-on-a-time-slot). */
export interface EventFormDefaults {
  type?: "job" | "visit" | "other";
  title?: string;
  customerId?: number;
  /** Label for the pre-selected customer (may be outside the search page). */
  customerName?: string;
  estimateId?: number;
  estimateNumber?: number;
  startTime?: string;
  endTime?: string;
}

interface EventFormPanelProps {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  defaults?: EventFormDefaults | null;
  editingEvent: CalEvent | null;
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
  defaults,
  editingEvent,
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

  const ev = editingEvent;

  // Pickers query the server (search + page) instead of bulk-loading, and
  // only while the panel is open so a closed form costs nothing.
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomerSearch = useDebouncedValue(customerSearch.trim());
  const { data: customersData } = useCustomers(
    {
      page: 1,
      perPage: PICKER_PAGE_SIZE,
      sort: "name",
      dir: "asc",
      q: debouncedCustomerSearch,
      source: "all",
      pipeline: "any",
    },
    { enabled: open }
  );
  const { data: estimatesData } = useEstimates(
    {
      page: 1,
      perPage: PICKER_PAGE_SIZE,
      sort: "date",
      dir: "desc",
      q: "",
      status: "all",
      customerId,
    },
    { enabled: open && type === "job" && !!customerId }
  );

  // Label for the current selection, known without the lists: from the event
  // being edited or from backlog/slot defaults.
  const [pickedCustomer, setPickedCustomer] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const selectedCustomer = useMemo(() => {
    if (!customerId) return null;
    if (pickedCustomer?.id === customerId) return pickedCustomer;
    const name =
      ev?.customerId === customerId
        ? ev.customer?.name
        : defaults?.customerId === customerId
          ? defaults.customerName
          : undefined;
    return { id: customerId, name: name ?? `Customer #${customerId}` };
  }, [customerId, pickedCustomer, ev, defaults]);
  const selectedEstimate = useMemo(() => {
    if (!estimateId) return null;
    const num =
      ev?.estimateId === estimateId
        ? ev.estimateNumber
        : defaults?.estimateId === estimateId
          ? defaults.estimateNumber
          : undefined;
    return { id: estimateId, estimateNumber: num ?? estimateId };
  }, [estimateId, ev, defaults]);

  const customers = withSelectedOption(
    customersData?.items ?? [],
    selectedCustomer
  );
  const customerEstimates = withSelectedOption(
    estimatesData?.items ?? [],
    selectedEstimate
  );
  const customersTruncated = isTruncated(
    customersData?.total,
    customersData?.items.length ?? 0
  );
  const estimatesTruncated = isTruncated(
    estimatesData?.total,
    estimatesData?.items.length ?? 0
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
    setCustomerSearch("");
    setPickedCustomer(null);
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
            disabled={!canSave || saving}
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
          <input
            type="search"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Search customers…"
            aria-label="Search customers"
            className={cn(inputClass, "mb-1.5")}
          />
          <select
            aria-label="Customer"
            value={customerId ?? ""}
            onChange={(e) => {
              const id = e.target.value
                ? parseInt(e.target.value, 10)
                : undefined;
              setCustomerId(id);
              setPickedCustomer(customers.find((c) => c.id === id) ?? null);
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
          {customersTruncated && (
            <div className="text-[11px] text-[var(--muted)] mt-1">
              Showing the first {customers.length} of {customersData?.total}{" "}
              customers — type to narrow the list.
            </div>
          )}
        </div>

        {/* Estimate (only for jobs) */}
        {type === "job" && (
          <div className="mb-4">
            <div className={labelClass}>
              Estimate <span className="text-[var(--accent)]">*</span>
            </div>
            <select
              aria-label="Estimate"
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
                    </option>
                  ))}
                </>
              )}
            </select>
            {estimatesTruncated && (
              <div className="text-[11px] text-[var(--muted)] mt-1">
                Showing the {estimatesData?.items.length} newest of{" "}
                {estimatesData?.total} estimates for this customer.
              </div>
            )}
            {missingEstimate && customerId && customerEstimates.length > 0 && (
              <div className="text-[11px] text-[var(--muted)] mt-1">
                Select the estimate this job is for.
              </div>
            )}
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
          {timeInvalid && (
            <div className="col-span-2 text-[11px] text-[var(--accent)]">
              End time must be after start time.
            </div>
          )}
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
