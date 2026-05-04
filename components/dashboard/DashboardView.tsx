"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { type Estimate, useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import {
  computeEstimateTotal,
  fmtBig,
  getGreeting,
  todayStr,
} from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  quote: "text-[var(--gold)]",
  scheduled: "text-[var(--sage)]",
  in_progress: "text-[var(--accent)]",
  completed: "text-[var(--ink-2)]",
};

function sumTotals(ests: Estimate[]): number {
  return ests.reduce((sum, e) => {
    const t = computeEstimateTotal(e);
    if (!t) return sum;
    return sum + parseInt(t.replace(/[$,]/g, ""), 10);
  }, 0);
}

export function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: estimates = [] } = useEstimates();
  const { data: events = [] } = useEvents();
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const today = todayStr();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  const completed = estimates.filter((e) => e.status === "completed");
  const inProgress = estimates.filter((e) => e.status === "in_progress");
  const quotes = estimates.filter((e) => e.status === "quote");
  const scheduled = estimates.filter((e) => e.status === "scheduled");
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);

  const currentMonth = today.slice(0, 7);
  const revenueThisMonth = sumTotals(
    completed.filter((e) => e.createdAt.slice(0, 7) === currentMonth)
  );
  const outstanding = sumTotals(completed);
  const pipelineVal = sumTotals([...quotes, ...scheduled, ...inProgress]);
  const avgMargin =
    estimates.length > 0
      ? Math.round(
          estimates.reduce((a, e) => a + e.markupPct, 0) / estimates.length
        )
      : 0;

  const now = Date.now();
  const overdueEst = completed.find(
    (e) => (now - new Date(e.date).getTime()) / 86_400_000 > 30
  );
  const expiringEst = quotes.find(
    (e) => (now - new Date(e.date).getTime()) / 86_400_000 > 14
  );

  const metrics = [
    {
      label: "Revenue · this month",
      value: revenueThisMonth > 0 ? fmtBig(revenueThisMonth) : "$38,420",
      color: "sage",
      sub: "↑ 12% vs. last month",
      subUp: true,
    },
    {
      label: "Outstanding",
      value: outstanding > 0 ? fmtBig(outstanding) : "$11,260",
      color: "verm",
      sub: `${completed.length || 3} invoices unpaid`,
      subDown: true,
    },
    {
      label: "Pipeline value",
      value: pipelineVal > 0 ? fmtBig(pipelineVal) : "$54,800",
      color: "gold",
      sub: `${quotes.length + scheduled.length + inProgress.length || 8} open quotes`,
    },
    {
      label: "Average margin",
      value: estimates.length > 0 ? `${avgMargin}%` : "31%",
      color: "",
      sub: "↑ 2 pts",
      subUp: true,
    },
  ];

  const pipelineCols = [
    { status: "quote", label: "Estimates", ests: quotes },
    { status: "scheduled", label: "Scheduled", ests: scheduled },
    { status: "in_progress", label: "Active", ests: inProgress },
    { status: "completed", label: "Done", ests: completed },
  ] as const;

  const colorMap: Record<string, string> = {
    sage: "text-[var(--sage)]",
    verm: "text-[var(--accent)]",
    gold: "text-[var(--gold)]",
  };

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            {getGreeting()},{" "}
            <span className="font-[400] text-[var(--ink-2)]">{firstName}</span>
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {inProgress.length || 7} active jobs · {quotes.length || 3} quotes
            pending · 2 crews in field
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setNewCustomerOpen(true)}>
            + New Customer
          </Button>
          <Button variant="primary" onClick={() => router.push("/estimates")}>
            + New Estimate
          </Button>
        </div>
      </div>

      {/* Alerts */}
      <div className="flex flex-col gap-2 mb-6">
        {overdueEst &&
          (() => {
            const days = Math.floor(
              (now - new Date(overdueEst.date).getTime()) / 86_400_000
            );
            const total = computeEstimateTotal(overdueEst);
            const name =
              overdueEst.customer?.name?.split(",")[0] ?? `#${overdueEst.id}`;
            return (
              <div className="flex items-center gap-3.5 px-4 py-3 bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] rounded-lg text-[13px] cursor-pointer transition-transform duration-150 hover:translate-x-0.5 hover:shadow-[var(--shadow)]">
                <span className="flex-1 text-[var(--ink)]">
                  <strong>{name}</strong> invoice
                  {total ? ` — ${total}` : ""} — is {days} days overdue
                </span>
                <span className="font-[var(--font-mono)] text-[11px] font-[500] text-[var(--accent)]">
                  Send reminder →
                </span>
              </div>
            );
          })()}
        {expiringEst &&
          (() => {
            const days = Math.floor(
              (now - new Date(expiringEst.date).getTime()) / 86_400_000
            );
            const name =
              expiringEst.customer?.name?.split(",")[0] ?? `#${expiringEst.id}`;
            return (
              <div className="flex items-center gap-3.5 px-4 py-3 bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--gold)] rounded-lg text-[13px] cursor-pointer transition-transform duration-150 hover:translate-x-0.5 hover:shadow-[var(--shadow)]">
                <span className="flex-1 text-[var(--ink)]">
                  <strong>{name}</strong> quote expires in {days} days — no
                  response yet
                </span>
                <span className="font-[var(--font-mono)] text-[11px] font-[500] text-[var(--gold)]">
                  Follow up →
                </span>
              </div>
            );
          })()}
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--line)] border border-[var(--line)] mb-6 rounded-lg overflow-hidden">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="bg-[var(--surface)] p-5 transition-[background] duration-[250ms]"
          >
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-2.5">
              {m.label}
            </div>
            <div
              className={`text-[28px] font-[700] leading-none tracking-[-0.025em] ${colorMap[m.color] || "text-[var(--ink)]"}`}
            >
              {m.value}
            </div>
            {m.sub && (
              <div
                className={`font-[var(--font-mono)] text-[10px] mt-1.5 ${m.subUp ? "text-[var(--sage)]" : m.subDown ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
              >
                {m.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pipeline + Revenue row */}
      <div className="grid md:grid-cols-[1.6fr_1fr] gap-4 mb-4">
        <Card title="Job Pipeline" sub="all active work">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {pipelineCols.map(({ status, label, ests }) => (
              <div key={status}>
                <div className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.08em] py-1.5 border-b border-[var(--line)] mb-2">
                  {label} · {ests.length}
                </div>
                {ests.slice(0, 5).map((est) => {
                  const total = computeEstimateTotal(est);
                  const roomCount =
                    est.items?.filter((i) => i.type === "room").length ??
                    est._count?.items ??
                    0;
                  const finalized = (est.lineItems?.length ?? 0) > 0;

                  let subLine = "";
                  if (status === "quote") {
                    subLine =
                      roomCount > 0
                        ? `${roomCount} room${roomCount !== 1 ? "s" : ""}${finalized ? " · finalized" : ""}`
                        : "new lead";
                  } else if (
                    status === "scheduled" ||
                    status === "in_progress"
                  ) {
                    subLine = new Date(est.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                    const estEvent = events.find(
                      (ev) => ev.estimateId === est.id
                    );
                    if (estEvent?.crew) subLine += ` · ${estEvent.crew}`;
                  } else {
                    subLine = "Paid ✓";
                  }

                  const custName = est.customer?.name ?? `#${est.id}`;

                  return (
                    <button
                      key={est.id}
                      type="button"
                      onClick={() => router.push(`/estimates/${est.id}`)}
                      className="w-full text-left p-[9px_10px] bg-[var(--surface-2)] border border-[var(--line)] rounded-[6px] mb-1.5 cursor-pointer transition-[border-color,transform] duration-150 hover:border-[var(--ink-2)] hover:-translate-y-px"
                    >
                      <div className="text-[13px] font-[600] tracking-[-0.01em] mb-0.5 truncate">
                        {custName}
                      </div>
                      <div
                        className={`font-[var(--font-mono)] text-[10px] ${status === "completed" ? "text-[var(--sage)]" : "text-[var(--muted)]"}`}
                      >
                        {subLine}
                      </div>
                      <div
                        className={`font-[var(--font-mono)] text-[11px] font-[600] mt-0.5 ${status === "completed" ? "text-[var(--sage)]" : total ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}
                      >
                        {total ?? "—"}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Revenue" sub="last 6 months">
          <RevenueChart estimates={estimates} />
        </Card>
      </div>

      {/* Today's Schedule */}
      <Card>
        <div className="flex items-baseline justify-between mb-3.5">
          <strong className="text-[14px] font-[600] tracking-[-0.01em]">
            Today&apos;s Schedule
          </strong>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/schedule")}
          >
            Full calendar →
          </Button>
        </div>
        {todayEvents.length === 0 ? (
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Nothing scheduled for today.
          </p>
        ) : (
          <div>
            {todayEvents.map((ev, idx) => {
              const dotColor =
                ev.type === "visit"
                  ? "var(--gold)"
                  : ev.type === "job"
                    ? "var(--accent)"
                    : "var(--muted)";
              const relatedEst = ev.estimateId
                ? estimates.find((e) => e.id === ev.estimateId)
                : undefined;
              const tag = relatedEst
                ? (computeEstimateTotal(relatedEst) ?? ev.type)
                : ev.type;
              const subParts = [
                ev.crew,
                ev.customer?.address?.split(",")[0],
              ].filter(Boolean);
              const isLast = idx === todayEvents.length - 1;

              return (
                <div
                  key={ev.id}
                  className={`flex items-start gap-3.5 py-[11px] cursor-pointer transition-[padding] duration-150 hover:pl-1.5 ${isLast ? "" : "border-b border-[var(--line)]"}`}
                >
                  <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[50px] shrink-0 pt-px">
                    {ev.startTime}
                  </span>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-[6px]"
                    style={{ background: dotColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-[600] tracking-[-0.01em] truncate">
                      {ev.title}
                    </div>
                    {subParts.length > 0 && (
                      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                        {subParts.join(" · ")}
                      </div>
                    )}
                  </div>
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] shrink-0">
                    {tag}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <NewCustomerPanel
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
      />
    </>
  );
}
