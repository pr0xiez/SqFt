"use client";

import { Card } from "@/components/ui/Card";
import { TapeMeter } from "@/components/ui/TapeMeter";
import { cn } from "@/lib/cn";
import type {
  DashboardRevenue,
  WeekSummary,
} from "@/lib/hooks/useDashboardRevenue";
import { fmtWholeDollar } from "@/lib/utils";

function WeekCell({
  week,
  maxAmount,
}: {
  week: WeekSummary;
  maxAmount: number;
}) {
  const pct =
    maxAmount > 0 ? Math.min((week.amount / maxAmount) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div
        className={cn(
          "text-[12.5px] whitespace-nowrap",
          week.isCurrent
            ? "font-[620] text-[var(--accent-ink)]"
            : "font-[500] text-[var(--muted)]"
        )}
      >
        {week.label}
      </div>
      <div
        className={cn(
          "type-figure text-[15px] font-[600] tracking-[-0.02em]",
          week.isFuture && "text-[var(--muted)] font-[500]"
        )}
      >
        ${fmtWholeDollar(week.amount)}
        {week.isFuture && (
          <span className="font-sans text-[12.5px] font-[400]"> to go</span>
        )}
      </div>
      <div className="h-[3px] relative bg-[var(--line)]">
        {!week.isFuture && pct > 0 && (
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              week.isCurrent ? "bg-[var(--accent)]" : "bg-[var(--ink-2)]"
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

interface Props {
  revenue: DashboardRevenue;
}

export function RevenueCard({ revenue }: Props) {
  const { mtdTotal, monthGoal, daysLeft, totalDays, weeks } = revenue;
  const goalRatio = monthGoal > 0 ? mtdTotal / monthGoal : 0;
  const daysElapsed = totalDays - daysLeft;
  const paceRatio = totalDays > 0 ? daysElapsed / totalDays : 0;
  const maxAmount = Math.max(
    ...weeks.filter((w) => !w.isFuture).map((w) => w.amount),
    1
  );
  const aheadOfPace = goalRatio >= paceRatio;

  return (
    <Card
      title="Booked revenue"
      sub="Approved estimates this month"
      action={
        <div className="text-right text-[13px] text-[var(--muted)] leading-snug">
          <span
            className={cn(
              "font-[620]",
              aheadOfPace ? "text-[var(--ok)]" : "text-[var(--ink-2)]"
            )}
          >
            {Math.round(goalRatio * 100)}% of goal
          </span>
          <br />
          {daysLeft} days left
        </div>
      }
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="type-stat text-[clamp(2rem,1.5rem+1.6vw,2.75rem)]">
          ${fmtWholeDollar(mtdTotal)}
        </span>
        <span className="text-[14px] text-[var(--muted)]">
          of <span className="type-figure">${fmtWholeDollar(monthGoal)}</span>{" "}
          goal
        </span>
      </div>

      <TapeMeter
        className="mt-9 mb-7"
        value={goalRatio}
        marker={paceRatio}
        markerLabel="Pace"
        label="Booked revenue toward this month's goal"
      />

      <div
        className="grid gap-x-4 gap-y-5 pt-5 border-t border-[var(--line)] grid-cols-2 sm:grid-cols-[repeat(var(--weeks),minmax(0,1fr))]"
        style={{ "--weeks": weeks.length } as React.CSSProperties}
      >
        {weeks.map((week) => (
          <WeekCell key={week.label} week={week} maxAmount={maxAmount} />
        ))}
      </div>
    </Card>
  );
}
