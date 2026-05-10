"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { getGreeting, todayStr } from "@/lib/utils";

export function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: estimates = [] } = useEstimates();
  const { data: events = [] } = useEvents();
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
    setDateLabel(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);

  const today = todayStr();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);

  const recentEstimates = estimates.slice(0, 8);

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between mb-8 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            {dateLabel}
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            {greeting},{" "}
            <span className="font-[400] text-[var(--ink-2)]">{firstName}</span>
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {estimates.length} estimate{estimates.length === 1 ? "" : "s"} ·{" "}
            {events.length} event{events.length === 1 ? "" : "s"} on the
            calendar
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

      {/* Recent estimates */}
      <Card title="Recent Estimates" sub="last 8 created">
        {recentEstimates.length === 0 ? (
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
            No estimates yet — create one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {recentEstimates.map((est) => {
              const roomCount = est._count?.items ?? est.items?.length ?? 0;
              const quoteCount = est._count?.quotes ?? est.quotes?.length ?? 0;
              return (
                <li key={est.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/estimates/${est.id}`)}
                    className="w-full text-left flex items-center gap-4 py-3 hover:bg-[var(--surface-2)] -mx-3 px-3 rounded transition-colors"
                  >
                    <span className="font-[var(--font-mono)] text-[12px] font-[600] w-20">
                      #{est.estimateNumber ?? est.id}
                    </span>
                    <span className="flex-1 text-[14px] font-[500] tracking-[-0.01em] truncate">
                      {est.customer?.name ?? "—"}
                    </span>
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                      {roomCount} room{roomCount === 1 ? "" : "s"}
                    </span>
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                      {quoteCount} quote{quoteCount === 1 ? "" : "s"}
                    </span>
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                      Open →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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
              const addressLine = ev.customer?.address?.split(",")[0];
              const hasCrew = ev.crewMembers.length > 0;
              const hasSubtitle = hasCrew || Boolean(addressLine);
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
                    {hasSubtitle && (
                      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 flex items-center gap-1.5 truncate">
                        {hasCrew && (
                          <span className="flex items-center gap-[2px] flex-shrink-0">
                            {ev.crewMembers.slice(0, 3).map((m) => (
                              <CrewAvatar key={m.id} name={m.name} size="sm" />
                            ))}
                          </span>
                        )}
                        <span className="truncate">
                          {hasCrew &&
                            ev.crewMembers.map((m) => m.name).join(" · ")}
                          {hasCrew && addressLine && " · "}
                          {addressLine}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] shrink-0">
                    {ev.type}
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
