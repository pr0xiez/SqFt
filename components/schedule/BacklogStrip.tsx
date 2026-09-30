"use client";

import { useState } from "react";
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
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
      >
        <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
          Unscheduled jobs
        </span>
        <span className="font-[var(--font-mono)] text-[10px] font-[600] text-[var(--bg)] bg-[var(--accent)] rounded-full px-1.5 py-px min-w-[18px]">
          {candidates.length}
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] text-[var(--muted)] transition-transform",
            collapsed && "-rotate-90"
          )}
        >
          ▾
        </span>
      </button>
      {!collapsed && (
        <div className="flex gap-2 px-3.5 pb-3 overflow-x-auto">
          {candidates.map((c) => {
            const days = waitingDays(c.approvedAt, nowMs);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSchedule(c)}
                className="shrink-0 w-[200px] text-left border border-[var(--line)] rounded-[6px] px-3 py-2.5 bg-[var(--surface)] cursor-pointer hover:border-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-[600] tracking-[-0.01em] truncate">
                    {c.customerName}
                  </span>
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] shrink-0">
                    #{c.estimateNumber}
                  </span>
                </div>
                {c.address && (
                  <div className="text-[11px] text-[var(--muted)] truncate mt-0.5">
                    {c.address}
                  </div>
                )}
                <div className="flex items-baseline justify-between mt-1.5">
                  <span className="font-[var(--font-mono)] text-[11px]">
                    {fmtDollar(c.total)}
                  </span>
                  {days !== null && (
                    <span
                      className={cn(
                        "font-[var(--font-mono)] text-[10px]",
                        days >= 7
                          ? "text-[var(--accent)]"
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
    </div>
  );
}
