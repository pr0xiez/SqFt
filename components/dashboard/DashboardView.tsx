// components/dashboard/DashboardView.tsx
"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { CrewCard } from "@/components/dashboard/CrewCard";
import { EstimatesTable } from "@/components/dashboard/EstimatesTable";
import { KpiPipeline } from "@/components/dashboard/KpiPipeline";
import { RevenueCard } from "@/components/dashboard/RevenueCard";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { Button } from "@/components/ui/Button";
import { useDashboardKPIs } from "@/lib/hooks/useDashboardKPIs";
import { useDashboardRevenue } from "@/lib/hooks/useDashboardRevenue";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { getGreeting } from "@/lib/utils";

export function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: kpis } = useDashboardKPIs();
  const { data: revenue } = useDashboardRevenue();
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

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const recentEstimates = estimates.slice(0, 8);

  return (
    <>
      {/* Page header */}
      <div
        className="grid gap-6 mb-8 pb-6 border-b border-[var(--line)]"
        style={{ gridTemplateColumns: "1fr auto", alignItems: "end" }}
      >
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.06em] uppercase mb-2 flex items-center gap-2.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background: "var(--sage)",
                boxShadow: "0 0 0 4px rgba(61,107,74,.12)",
              }}
            />
            {dateLabel}
          </div>
          <h1 className="text-[40px] font-[700] leading-[1.02] tracking-[-0.03em]">
            {greeting},{" "}
            <span className="font-[400] text-[var(--ink-2)]">{firstName}.</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setNewCustomerOpen(true)}>
            + New Customer
          </Button>
          <Button onClick={() => router.push("/estimates")}>
            + Quick Quote
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push("/estimates/new")}
          >
            + New Estimate
          </Button>
        </div>
      </div>

      {/* KPI Pipeline */}
      {kpis && <KpiPipeline kpis={kpis} />}

      {/* Main grid: schedule (full-width since inbox is removed) */}
      <div className="mb-6">
        <ScheduleCard events={events} />
      </div>

      {/* Ops strip: revenue + crew */}
      <div
        className="grid gap-6 mb-6"
        style={{ gridTemplateColumns: "2fr 1fr" }}
      >
        {revenue && <RevenueCard revenue={revenue} />}
        <CrewCard events={events} />
      </div>

      {/* Estimates table */}
      <EstimatesTable estimates={recentEstimates} />

      <NewCustomerPanel
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
      />
    </>
  );
}
