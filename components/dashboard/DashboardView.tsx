"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { computeEstimateTotal, getGreeting, todayStr } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  quote: "text-[var(--gold)]",
  scheduled: "text-[var(--sage)]",
  in_progress: "text-[var(--accent)]",
  completed: "text-[var(--ink-2)]",
};

export function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: estimates = [] } = useEstimates();
  const { data: events = [] } = useEvents();
  const { data: customers = [] } = useCustomers();
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const today = todayStr();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  const completed = estimates.filter((e) => e.status === "completed");
  const inProgress = estimates.filter((e) => e.status === "in_progress");
  const quotes = estimates.filter((e) => e.status === "quote");
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between pb-4 border-b border-[var(--line)]">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <h1 className="font-[var(--font-display)] text-[36px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
            {getGreeting()},{" "}
            <span className="font-[400] text-[var(--ink-2)]">{firstName}</span>
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-1">
            {inProgress.length} active · {quotes.length} quotes pending
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setNewCustomerOpen(true)}>
            + New Customer
          </Button>
          <Button variant="primary" onClick={() => router.push("/customers")}>
            + New Estimate
          </Button>
        </div>
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
            <div className="divide-y divide-[var(--line)]">
              {todayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[50px] shrink-0">
                    {ev.startTime}
                  </span>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: `var(--${ev.type === "job" ? "sage" : ev.type === "visit" ? "gold" : "muted"})`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-[var(--font-display)] text-[13px] font-[600] text-[var(--ink)] leading-tight truncate tracking-[-0.01em]">
                      {ev.title}
                    </div>
                    {ev.crew && (
                      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                        {ev.crew}
                      </div>
                    )}
                  </div>
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] shrink-0">
                    {ev.type}
                  </span>
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
                {statusEstimates.slice(0, 5).map((est) => {
                  const total = computeEstimateTotal(est);
                  return (
                    <div
                      key={est.id}
                      className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[6px] px-2.5 py-2 cursor-pointer transition-[transform,border-color] duration-[150ms] hover:border-[var(--ink-2)] hover:-translate-y-px"
                    >
                      <div className="font-[var(--font-display)] text-[13px] font-[600] text-[var(--ink)] truncate tracking-[-0.01em]">
                        {est.customer?.name ?? `#${est.id}`}
                      </div>
                      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                        {new Date(est.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      {total && (
                        <div className="font-[var(--font-mono)] text-[11px] font-[600] text-[var(--ink)] mt-0.5">
                          {total}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
        )}
      </div>

      <NewCustomerPanel
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
      />
    </div>
  );
}
