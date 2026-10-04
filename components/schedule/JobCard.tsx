"use client";

import Link from "next/link";
import { useEffect } from "react";
import { eventAccent, eventLabel } from "@/components/schedule/eventMeta";
import { buttonClasses } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import {
  CaretRightIcon,
  MapPinIcon,
  PhoneIcon,
  XIcon,
} from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { formatClock, formatSectionLabel } from "@/lib/schedule/agenda";

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const ROW = "flex items-center gap-3 py-3 border-t border-[var(--line)]";
const ACTION_ROW = cn(
  ROW,
  "min-h-[60px] -mx-2 px-2 rounded-[var(--r)] no-underline text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
);
const ROW_ICON =
  "flex items-center justify-center size-10 shrink-0 rounded-[var(--r)] bg-[var(--surface-2)] text-[var(--ink-2)] [&_svg]:size-5";

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
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className={cn(
          "relative w-full sm:max-w-[480px] bg-[var(--paper)] border border-[var(--line)]",
          "rounded-t-[var(--r)] sm:rounded-[var(--r)] shadow-[var(--shadow-md)]",
          "px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))]",
          "max-h-[90vh] overflow-auto"
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn("w-[3px] self-stretch", eventAccent(event.type))}
          />
          <div className="flex-1 min-w-0">
            <Tag>{eventLabel(event.type)}</Tag>
            <h2 className="type-display text-[22px] mt-2 break-words">
              {event.title}
            </h2>
            <div className="text-[14px] text-[var(--ink-2)] mt-1.5">
              {formatSectionLabel(event.date.slice(0, 10))} ·{" "}
              <span className="type-figure">
                {formatClock(event.startTime)} - {formatClock(event.endTime)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={buttonClasses({
              variant: "ghost",
              className: "w-10 px-0 -mr-2 -mt-1",
            })}
          >
            <XIcon aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          {event.customer ? (
            <div className={ROW}>
              <div className="flex-1 min-w-0">
                <div className="type-label">Customer</div>
                <div className="text-[15px] font-[600] truncate mt-0.5">
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
              className={ACTION_ROW}
            >
              <span className={ROW_ICON}>
                <MapPinIcon aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="type-label">Address</div>
                <div className="text-[15px] font-[600] truncate mt-0.5">
                  {event.address}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[14px] font-[600] text-[var(--accent-ink)] shrink-0">
                Directions
                <CaretRightIcon aria-hidden="true" className="size-4" />
              </span>
            </a>
          ) : null}

          {event.customer?.phone ? (
            <a href={`tel:${event.customer.phone}`} className={ACTION_ROW}>
              <span className={ROW_ICON}>
                <PhoneIcon aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="type-label">Contact</div>
                <div className="type-figure text-[15px] font-[600] mt-0.5">
                  {event.customer.phone}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[14px] font-[600] text-[var(--accent-ink)] shrink-0">
                Call
                <CaretRightIcon aria-hidden="true" className="size-4" />
              </span>
            </a>
          ) : null}

          {event.assignees.length > 0 ? (
            <div className={cn(ROW, "block")}>
              <div className="type-label">Crew</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5">
                {event.assignees.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1.5 text-[14px]"
                  >
                    <CrewAvatar name={a.name} size="lg" /> {a.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {event.notes ? (
            <div className={cn(ROW, "block")}>
              <div className="type-label">Notes</div>
              <div className="text-[14px] mt-1 whitespace-pre-wrap">
                {event.notes}
              </div>
            </div>
          ) : null}
        </div>

        {event.customerId || event.estimateId ? (
          <div className="flex gap-2.5 mt-4">
            {event.customerId ? (
              <Link
                href={`/customers/${event.customerId}`}
                className={buttonClasses({ size: "lg", className: "flex-1" })}
              >
                View customer
              </Link>
            ) : null}
            {event.estimateId ? (
              <Link
                href={`/estimates/${event.estimateId}`}
                className={buttonClasses({
                  variant: "ink",
                  size: "lg",
                  className: "flex-1",
                })}
              >
                View estimate
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
