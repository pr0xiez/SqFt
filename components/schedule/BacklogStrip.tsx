"use client";

import { useState } from "react";
import { CaretDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { SchedulableCandidate } from "@/lib/schedule/backlog";
import { fmtDollar } from "@/lib/utils";

/** Whole days an approved estimate has been waiting for a schedule slot. */
export function waitingDays(
  approvedAt: string | null,
  nowMs: number
): number | null {
  if (!approvedAt) return null;
  const approvedMs = new Date(approvedAt).getTime();
  if (Number.isNaN(approvedMs)) return null;
  return Math.max(0, Math.floor((nowMs - approvedMs) / 86_400_000));
}

interface BacklogStripProps {
  candidates: SchedulableCandidate[];
  onSchedule: (candidate: SchedulableCandidate) => void;
}

/**
 * Collapsible "Unscheduled jobs" strip above the calendar: approved estimates
 * with no job event yet, longest-waiting first. Clicking a card opens the
 * event form pre-filled for that estimate. Hidden entirely when empty.
 */
export function BacklogStrip({ candidates, onSchedule }: BacklogStripProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (candidates.length === 0) return null;

  const nowMs = Date.now();

  return (
    <section className="card mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2.5 px-4 min-h-[48px] cursor-pointer hover:bg-[var(--hover)] transition-colors"
      >
        <span className="text-[14.5px] font-[600] tracking-[-0.01em]">
          Unscheduled jobs
        </span>
        <span className="type-figure text-[12px] font-[600] leading-none text-[var(--on-accent)] bg-[var(--accent)] rounded-[var(--r-in)] px-1.5 py-[3px] min-w-[20px] text-center">
          {candidates.length}
        </span>
        <CaretDownIcon
          aria-hidden="true"
          className={cn(
            "ml-auto size-4 text-[var(--muted)] transition-transform duration-200 ease-[var(--ease)]",
            collapsed && "-rotate-90"
          )}
        />
      </button>
      {!collapsed && (
        <div className="flex gap-2 px-4 pb-4 overflow-x-auto no-scrollbar snap-x">
          {candidates.map((c) => {
            const days = waitingDays(c.approvedAt, nowMs);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSchedule(c)}
                className="shrink-0 snap-start w-[220px] text-left border border-[var(--line)] rounded-[var(--r)] px-3 py-2.5 bg-[var(--bg)] cursor-pointer hover:border-[var(--ink-2)] hover:bg-[var(--hover)] transition-colors active:scale-[0.98]"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-[600] tracking-[-0.01em] truncate">
                    {c.customerName}
                  </span>
                  <span className="type-figure text-[12.5px] text-[var(--muted)] shrink-0 ml-auto">
                    #{c.estimateNumber}
                  </span>
                </div>
                {c.address && (
                  <div className="text-[13px] text-[var(--muted)] truncate mt-0.5">
                    {c.address}
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-2 mt-2">
                  <span className="type-figure text-[13.5px] font-[600]">
                    {fmtDollar(c.total)}
                  </span>
                  {days !== null && (
                    <span
                      className={cn(
                        "type-figure text-[12.5px]",
                        days >= 7
                          ? "text-[var(--accent-ink)] font-[600]"
                          : "text-[var(--muted)]"
                      )}
                    >
                      waiting {days}d
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
