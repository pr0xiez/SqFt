"use client";

import type {
  DashboardRevenue,
  WeekSummary,
} from "@/lib/hooks/useDashboardRevenue";
import { fmtWholeDollar } from "@/lib/utils";

interface WeekBarProps {
  week: WeekSummary;
  maxAmount: number;
}

function WeekBar({ week, maxAmount }: WeekBarProps) {
  const pct =
    maxAmount > 0 ? Math.min((week.amount / maxAmount) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.06em]"
        style={{
          color: week.isCurrent ? "var(--accent)" : "var(--muted)",
          fontWeight: week.isCurrent ? 600 : 400,
        }}
      >
        {week.label}
      </div>
      <div className="font-[var(--font-mono)] text-[14px] font-[600] tracking-[-0.02em]">
        {week.isFuture ? (
          <span style={{ color: "var(--muted)", fontWeight: 500 }}>
            <span
              style={{
                color: "var(--muted)",
                fontSize: "12px",
                marginRight: "1px",
              }}
            >
              $
            </span>
            {fmtWholeDollar(week.amount)}{" "}
            <span
              style={{
                color: "var(--muted)",
                fontWeight: 400,
                fontSize: "12px",
              }}
            >
              to go
            </span>
          </span>
        ) : (
          <>
            <span
              style={{
                color: "var(--muted)",
                fontWeight: 500,
                fontSize: "12px",
                marginRight: "1px",
              }}
            >
              $
            </span>
            {fmtWholeDollar(week.amount)}
          </>
        )}
      </div>
      <div
        className="h-[5px] rounded-[3px] relative overflow-hidden"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-[3px]"
          style={{
            width: `${pct}%`,
            background: week.isFuture
              ? "repeating-linear-gradient(45deg,var(--line),var(--line) 3px,var(--surface-2) 3px,var(--surface-2) 6px)"
              : week.isCurrent
                ? "var(--accent)"
                : "var(--ink-2)",
          }}
        />
      </div>
    </div>
  );
}

interface Props {
  revenue: DashboardRevenue;
}

export function RevenueCard({ revenue }: Props) {
  const { mtdTotal, monthGoal, daysLeft, totalDays, weeks } = revenue;
  const goalPct = Math.min((mtdTotal / monthGoal) * 100, 100);
  const daysElapsed = totalDays - daysLeft;
  const pacePct = (daysElapsed / totalDays) * 100;
  const maxAmount = Math.max(
    ...weeks.filter((w) => !w.isFuture).map((w) => w.amount),
    1
  );

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <div className="flex justify-between items-end mb-2">
        <div>
          <div
            className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] mb-2"
            style={{ color: "var(--muted)" }}
          >
            Booked revenue · month-to-date
          </div>
          <div className="text-[40px] font-[700] tracking-[-0.03em] leading-none">
            <span
              style={{
                fontSize: "22px",
                color: "var(--muted)",
                fontWeight: 500,
                marginRight: "2px",
              }}
            >
              $
            </span>
            {fmtWholeDollar(mtdTotal)}
          </div>
        </div>
        <div
          className="text-right font-[var(--font-mono)] text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          Target ${fmtWholeDollar(monthGoal)}
          <br />
          <span style={{ color: "var(--sage)", fontWeight: 600 }}>
            {Math.round(goalPct)}% of goal
          </span>{" "}
          · {daysLeft} days left
        </div>
      </div>

      <div
        className="relative h-3.5 rounded-[7px] my-5"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-[7px]"
          style={{ width: `${goalPct}%`, background: "var(--accent)" }}
        />
        <div
          className="absolute top-[-6px] bottom-[-6px] w-0.5"
          style={{ left: `${pacePct}%`, background: "var(--ink)" }}
        >
          <span
            className="absolute font-[var(--font-mono)] text-[9px] uppercase tracking-[.06em] whitespace-nowrap"
            style={{
              top: "-16px",
              left: "50%",
              transform: "translateX(-50%)",
              color: "var(--ink)",
              background: "var(--surface)",
              padding: "0 4px",
            }}
          >
            pace
          </span>
        </div>
      </div>

      <div
        className="flex justify-between font-[var(--font-mono)] text-[10px] mb-6"
        style={{ color: "var(--muted)" }}
      >
        <span>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
            ${fmtWholeDollar(mtdTotal)}
          </strong>{" "}
          booked
        </span>
        <span>
          of{" "}
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
            ${fmtWholeDollar(monthGoal)}
          </strong>{" "}
          goal
        </span>
      </div>

      <div
        className="grid gap-4 pt-[18px] border-t border-[var(--line)]"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
      >
        {weeks.map((week) => (
          <WeekBar key={week.label} week={week} maxAmount={maxAmount} />
        ))}
      </div>
    </article>
  );
}
