"use client";

import { relativeTime } from "@/lib/estimateStatus";
import { formatShortDate } from "@/lib/utils";

interface Stats {
  siteMeasureCount: number;
  estimateCount: number;
  open: number;
  accepted: number;
  declined: number;
  lastActivity: string | null;
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "ink" | "sage" | "gold" | "accent" | "muted";
}) {
  const colorMap: Record<string, string> = {
    ink: "var(--ink)",
    sage: "var(--sage)",
    gold: "var(--gold)",
    accent: "var(--accent)",
    muted: "var(--muted)",
  };
  return (
    <div className="flex-1 min-w-[120px] px-4 py-3.5">
      <div className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.09em] text-[var(--muted)] mb-1.5">
        {label}
      </div>
      <div
        className="text-[26px] font-[700] leading-none tracking-[-0.03em] tabular-nums"
        style={{ color: colorMap[tone ?? "ink"] }}
      >
        {value}
      </div>
      {hint && (
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-1.5 tracking-[.02em]">
          {hint}
        </div>
      )}
    </div>
  );
}

export function CustomerStatStrip({ stats }: { stats: Stats }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg mb-4 flex flex-wrap divide-x divide-[var(--line)] overflow-hidden">
      <Stat
        label="Site Measures"
        value={stats.siteMeasureCount}
        hint={`${stats.estimateCount} estimate${stats.estimateCount === 1 ? "" : "s"} total`}
      />
      <Stat
        label="Open"
        value={stats.open}
        tone={stats.open > 0 ? "gold" : "muted"}
        hint={stats.open > 0 ? "Awaiting reply" : "Nothing pending"}
      />
      <Stat
        label="Accepted"
        value={stats.accepted}
        tone={stats.accepted > 0 ? "sage" : "muted"}
        hint={stats.declined > 0 ? `${stats.declined} declined` : undefined}
      />
      <Stat
        label="Last activity"
        value={stats.lastActivity ? relativeTime(stats.lastActivity) : "—"}
        hint={
          stats.lastActivity ? formatShortDate(stats.lastActivity) : undefined
        }
      />
    </div>
  );
}
