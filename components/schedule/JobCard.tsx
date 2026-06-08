"use client";

import Link from "next/link";
import { useEffect } from "react";
import { eventAccent, eventLabel } from "@/components/schedule/eventMeta";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { formatClock, formatSectionLabel } from "@/lib/schedule/agenda";

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function JobCard({
  event,
  onClose,
}: {
  event: CalEvent | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className={cn(
          "relative w-full sm:max-w-[480px] bg-[var(--paper)]",
          "rounded-t-2xl shadow-2xl p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))]",
          "max-h-[90vh] overflow-auto"
        )}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "w-1.5 self-stretch rounded",
              eventAccent(event.type)
            )}
          />
          <div className="flex-1 min-w-0">
            <span className="text-[9.5px] font-[700] uppercase px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
              {eventLabel(event.type)}
            </span>
            <h2 className="text-[18px] font-[700] mt-1.5">{event.title}</h2>
            <div className="text-[12.5px] text-[var(--ink-2)]">
              {formatSectionLabel(event.date.slice(0, 10))} ·{" "}
              {formatClock(event.startTime)} – {formatClock(event.endTime)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-[var(--surface-2)] text-[var(--ink-2)] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {event.customer ? (
          <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">
                Customer
              </div>
              <div className="text-[13.5px] font-[600] truncate">
                {event.customer.name}
              </div>
            </div>
          </div>
        ) : null}

        {event.address ? (
          <a
            href={mapsHref(event.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 pt-3 border-t border-[var(--line)] flex items-center gap-2.5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">
                Address
              </div>
              <div className="text-[13.5px] font-[600] truncate">
                {event.address}
              </div>
            </div>
            <span className="text-[11px] font-[700] text-[var(--accent)]">
              Directions ›
            </span>
          </a>
        ) : null}

        {event.customer?.phone ? (
          <a
            href={`tel:${event.customer.phone}`}
            className="mt-1 pt-3 border-t border-[var(--line)] flex items-center gap-2.5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">
                Contact
              </div>
              <div className="text-[13.5px] font-[600]">
                {event.customer.phone}
              </div>
            </div>
            <span className="text-[11px] font-[700] text-[var(--accent)]">
              Call
            </span>
          </a>
        ) : null}

        {event.assignees.length > 0 ? (
          <div className="mt-1 pt-3 border-t border-[var(--line)]">
            <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">
              Crew
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {event.assignees.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1 text-[12.5px]"
                >
                  <CrewAvatar name={a.name} size="lg" /> {a.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {event.notes ? (
          <div className="mt-1 pt-3 border-t border-[var(--line)]">
            <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">
              Notes
            </div>
            <div className="text-[12.5px] mt-0.5 whitespace-pre-wrap">
              {event.notes}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2.5 mt-4">
          {event.customerId ? (
            <Link
              href={`/customers/${event.customerId}`}
              className="flex-1 text-center py-2.5 rounded-xl bg-[var(--surface-2)] text-[13px] font-[700]"
            >
              View customer
            </Link>
          ) : null}
          {event.estimateId ? (
            <Link
              href={`/estimates/${event.estimateId}`}
              className="flex-1 text-center py-2.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-[13px] font-[700]"
            >
              View estimate
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
