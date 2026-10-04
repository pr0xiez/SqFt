"use client";

import { Stat } from "@/components/ui/Stat";
import { cn } from "@/lib/cn";
import type { CustomerMoneySummary } from "@/lib/customers/activity";
import { relativeTime } from "@/lib/estimateStatus";
import { fmtBig, fmtDollar, formatShortDate } from "@/lib/utils";

/**
 * Four figures in one bordered band, divided by hairlines (like the dashboard
 * KPI strip); folds to a 2-column grid on phones. The estimate figures come
 * with the customer; the balance waits for their invoices (`moneyReady`).
 */
export function CustomerStatStrip({
  summary: s,
  moneyReady,
  lastActivity,
}: {
  summary: CustomerMoneySummary;
  moneyReady: boolean;
  lastActivity: string | null;
}) {
  const approvedSub =
    [
      s.approvedValue > 0 ? `${fmtBig(s.approvedValue)} won` : null,
      s.declinedCount > 0 ? `${s.declinedCount} declined` : null,
    ]
      .filter(Boolean)
      .join(", ") || undefined;

  const cells = [
    {
      label: "Open estimates",
      value: s.openCount,
      sub:
        s.openValue > 0
          ? `${fmtBig(s.openValue)} awaiting reply`
          : s.openCount > 0
            ? "Awaiting reply"
            : "Nothing pending",
      tone: s.openCount > 0 ? "text-[var(--warn)]" : "text-[var(--muted)]",
    },
    {
      label: "Approved",
      value: s.approvedCount,
      sub: approvedSub,
      tone: s.approvedCount > 0 ? "text-[var(--ok)]" : "text-[var(--muted)]",
    },
    {
      label: "Balance due",
      value: moneyReady ? fmtDollar(s.balanceDue) : "-",
      sub: !moneyReady ? undefined : s.overdueCount > 0 ? (
        <span className="font-[560] text-[var(--accent-ink)]">
          {s.overdueCount} overdue
        </span>
      ) : s.invoiced > 0 ? (
        `${fmtBig(s.paid)} of ${fmtBig(s.invoiced)} paid`
      ) : (
        "Nothing invoiced yet"
      ),
      tone: !moneyReady
        ? "text-[var(--muted)]"
        : s.overdueCount > 0
          ? "text-[var(--accent-ink)]"
          : s.balanceDue > 0
            ? "text-[var(--ink)]"
            : "text-[var(--muted)]",
    },
    {
      label: "Last activity",
      value: lastActivity ? relativeTime(lastActivity) : "-",
      sub: lastActivity ? formatShortDate(lastActivity) : undefined,
      tone: "text-[var(--ink)]",
    },
  ];

  return (
    <div
      data-testid="customer-stats"
      className="card grid grid-cols-2 lg:grid-cols-4 overflow-hidden mb-6"
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={cn(
            "px-5 py-5 md:px-6 border-[var(--line)]",
            // hairlines between cells: 2 columns on phones, 4 from lg up
            i % 2 === 0 && "border-r",
            i === 1 && "lg:border-r",
            i >= 2 && "border-t lg:border-t-0"
          )}
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
