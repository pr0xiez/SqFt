"use client";

import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Card } from "@/components/ui/Card";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { getGreeting, todayStr } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  quote: "text-[var(--gold)]",
  scheduled: "text-[var(--sage)]",
  in_progress: "text-[var(--accent)]",
  completed: "text-[var(--ink-2)]",
};

export function DashboardView() {
  const { data: estimates = [] } = useEstimates();
  const { data: events = [] } = useEvents();
  const { data: customers = [] } = useCustomers();
  const today = todayStr();

  const completed = estimates.filter((e) => e.status === "completed");
  const inProgress = estimates.filter((e) => e.status === "in_progress");
  const quotes = estimates.filter((e) => e.status === "quote");
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-4 border-b border-[var(--line)]">
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
          {getGreeting()}
        </div>
        <h1 className="font-[var(--font-display)] text-[36px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
          Dashboard
        </h1>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--line)] border border-[var(--line)] rounded-lg overflow-hidden">
        {[
          { label: "Customers", value: customers.length, color: "" },
          {
            label: "Open quotes",
            value: quotes.length,
            color: "text-[var(--gold)]",
          },
          {
            label: "In progress",
            value: inProgress.length,
            color: "text-[var(--accent)]",
          },
          {
            label: "Completed",
            value: completed.length,
            color: "text-[var(--sage)]",
          },
        ].map((m) => (
          <div key={m.label} className="bg-[var(--surface)] px-5 py-5">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-2.5">
              {m.label}
            </div>
            <div
              className={`font-[var(--font-display)] text-[28px] font-[700] leading-none tracking-[-0.025em] ${m.color || "text-[var(--ink)]"}`}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Two column: chart + today */}
      <div className="grid md:grid-cols-[1fr_280px] gap-4">
        <Card title="Revenue" sub="Last 6 months">
          <RevenueChart estimates={estimates} />
        </Card>

        <Card title="Today's schedule">
          {todayEvents.length === 0 ? (
            <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              Nothing scheduled for today.
            </p>
          ) : (
            <div className="space-y-0 divide-y divide-[var(--line)]">
              {todayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer transition-[padding] duration-[150ms] hover:pl-1.5"
                  style={{
                    borderLeft: `3px solid var(--${ev.type === "job" ? "sage" : ev.type === "visit" ? "gold" : "muted"})`,
                    paddingLeft: "10px",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-[var(--font-display)] text-[13px] font-[600] text-[var(--ink)] leading-tight truncate tracking-[-0.01em]">
                      {ev.title}
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                      {ev.startTime} – {ev.endTime}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(["quote", "scheduled", "in_progress", "completed"] as const).map(
          (status) => {
            const statusEstimates = estimates.filter(
              (e) => e.status === status
            );
            const label = {
              quote: "Quote",
              scheduled: "Scheduled",
              in_progress: "In progress",
              completed: "Completed",
            }[status];

            return (
              <div key={status} className="flex flex-col gap-2">
                <div
                  className={`font-[var(--font-mono)] text-[9px] uppercase tracking-[.08em] pb-1.5 border-b border-[var(--line)] ${STATUS_COLORS[status]}`}
                >
                  {label}{" "}
                  <span className="opacity-60">({statusEstimates.length})</span>
                </div>
                {statusEstimates.slice(0, 5).map((est) => (
                  <div
                    key={est.id}
                    className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[6px] px-2.5 py-2 cursor-pointer transition-[transform,border-color] duration-[150ms] hover:border-[var(--ink-2)] hover:-translate-y-px"
                  >
                    <div className="font-[var(--font-display)] text-[13px] font-[600] text-[var(--ink)] truncate tracking-[-0.01em]">
                      {est.customer?.name ?? `#${est.id}`}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}
