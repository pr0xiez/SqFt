"use client";

import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Card } from "@/components/ui/Card";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { getGreeting, todayStr } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  quote: "text-gold",
  scheduled: "text-sage",
  in_progress: "text-vermil",
  completed: "text-oak",
};

export function DashboardView() {
  const { data: estimates = [] } = useEstimates();
  const { data: events = [] } = useEvents();
  const { data: customers = [] } = useCustomers();
  const today = todayStr();

  // KPI calculations
  const completed = estimates.filter((e) => e.status === "completed");
  const inProgress = estimates.filter((e) => e.status === "in_progress");
  const quotes = estimates.filter((e) => e.status === "quote");
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <div className="pb-[14px] border-b-2 border-oak">
        <p className="font-[var(--font-label)] text-[11px] italic text-vermil mb-1">
          {getGreeting()} —
        </p>
        <h1 className="font-[var(--font-display)] text-[44px] font-black text-oak leading-[.9] tracking-tight">
          Dashboard
        </h1>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-[1.5px] border-oak bg-oak shadow-[4px_4px_0_var(--oak-l)] overflow-hidden">
        {[
          { label: "Customers", value: customers.length, color: "" },
          { label: "Open Quotes", value: quotes.length, color: "text-gold" },
          {
            label: "In Progress",
            value: inProgress.length,
            color: "text-vermil",
          },
          { label: "Completed", value: completed.length, color: "text-sage" },
        ].map((m, _i) => (
          <div
            key={m.label}
            className="bg-cream px-[18px] py-[20px] border-r border-oak last:border-r-0 relative"
          >
            <div
              className={`font-[var(--font-display)] text-[30px] font-black leading-none tracking-tight ${m.color || "text-oak"}`}
            >
              {m.value}
            </div>
            <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood mt-1">
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid md:grid-cols-[1fr_280px] gap-5">
        {/* Revenue chart */}
        <Card title="Revenue — Last 6 Months">
          <RevenueChart estimates={estimates} />
        </Card>

        {/* Today's schedule */}
        <Card title="Today's Schedule">
          {todayEvents.length === 0 ? (
            <p className="font-[var(--font-mono)] text-xs text-driftwood italic">
              Nothing scheduled for today.
            </p>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex gap-3 p-[10px_12px_10px_14px] bg-linen border border-linen-dd shadow-[2px_2px_0_var(--linen-dd)]"
                  style={{
                    borderLeft: `3px solid var(--${ev.type === "job" ? "sage" : ev.type === "visit" ? "gold" : "driftwood"})`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-[var(--font-display)] text-[13px] font-bold text-oak leading-tight truncate">
                      {ev.title}
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-driftwood mt-0.5">
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
              in_progress: "In Progress",
              completed: "Completed",
            }[status];

            return (
              <div key={status} className="flex flex-col gap-2">
                <div
                  className={`font-[var(--font-mono)] text-[10px] uppercase tracking-widest px-3 py-1.5 border border-current ${STATUS_COLORS[status]}`}
                >
                  {label}{" "}
                  <span className="opacity-60">({statusEstimates.length})</span>
                </div>
                {statusEstimates.slice(0, 5).map((est) => (
                  <div
                    key={est.id}
                    className="bg-linen border border-linen-dd p-[7px_9px] text-sm"
                  >
                    <div className="font-[var(--font-display)] text-xs font-bold text-oak truncate">
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
