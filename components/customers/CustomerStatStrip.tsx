"use client";

import { Stat } from "@/components/ui/Stat";
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

/**
 * Four figures in one bordered band, divided by hairlines (like the dashboard
 * KPI strip); folds to a 2-column grid on phones.
 */
export function CustomerStatStrip({ stats }: { stats: Stats }) {
  const cells = [
    {
      label: "Site Measures",
      value: stats.siteMeasureCount,
      sub: `${stats.estimateCount} estimate${stats.estimateCount === 1 ? "" : "s"} total`,
      tone: "text-[var(--ink)]",
    },
    {
      label: "Open",
      value: stats.open,
      sub: stats.open > 0 ? "Awaiting reply" : "Nothing pending",
      tone: stats.open > 0 ? "text-[var(--warn)]" : "text-[var(--muted)]",
    },
    {
      label: "Accepted",
      value: stats.accepted,
      sub: stats.declined > 0 ? `${stats.declined} declined` : undefined,
      tone: stats.accepted > 0 ? "text-[var(--ok)]" : "text-[var(--muted)]",
    },
    {
      label: "Last activity",
      value: stats.lastActivity ? relativeTime(stats.lastActivity) : "-",
      sub: stats.lastActivity ? formatShortDate(stats.lastActivity) : undefined,
      tone: "text-[var(--ink)]",
    },
  ];

  return (
    <div className="card grid grid-cols-2 lg:grid-cols-4 overflow-hidden mb-6">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={[
            "px-5 py-5 md:px-6 border-[var(--line)]",
            // hairlines between cells: 2 columns on phones, 4 from lg up
            i % 2 === 0 ? "border-r" : "",
            i === 1 ? "lg:border-r" : "",
            i >= 2 ? "border-t lg:border-t-0" : "",
          ].join(" ")}
        >
          <Stat
            label={cell.label}
            value={cell.value}
            size="md"
            valueClassName={cell.tone}
            sub={cell.sub}
          />
        </div>
      ))}
    </div>
  );
}
