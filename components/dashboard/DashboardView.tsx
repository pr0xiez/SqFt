// components/dashboard/DashboardView.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { CrewCard } from "@/components/dashboard/CrewCard";
import { KpiPipeline } from "@/components/dashboard/KpiPipeline";
import { RevenueCard } from "@/components/dashboard/RevenueCard";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { SiteMeasuresTable } from "@/components/dashboard/SiteMeasuresTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useDashboardKPIs } from "@/lib/hooks/useDashboardKPIs";
import { useDashboardRevenue } from "@/lib/hooks/useDashboardRevenue";
import { useEvents } from "@/lib/hooks/useEvents";
import { useSiteMeasures } from "@/lib/hooks/useSiteMeasures";
import { formatLongDateWithWeekday, getGreeting } from "@/lib/utils";

export function DashboardView() {
  const { data: session } = useSession();
  const { data: kpis } = useDashboardKPIs();
  const { data: revenue } = useDashboardRevenue();
  const { data: siteMeasuresData } = useSiteMeasures({
    page: 1,
    perPage: 25,
    sort: "date",
    dir: "desc",
    q: "",
    status: "all",
  });
  const siteMeasures = siteMeasuresData?.items ?? [];
  const { data: events = [] } = useEvents();
  const [greeting, setGreeting] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
    setDateLabel(formatLongDateWithWeekday(new Date()));
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const recentEstimates = siteMeasures.slice(0, 8);

  return (
    <>
      <PageHeader
        kicker={<span suppressHydrationWarning>{dateLabel || "\u00a0"}</span>}
        title={
          <>
            {greeting || "Hello"},{" "}
            <span className="text-[var(--muted)] font-[560]">{firstName}.</span>
          </>
        }
      />

      {kpis ? (
        <KpiPipeline kpis={kpis} />
      ) : (
        <div className="card h-[130px] mb-6 animate-pulse" aria-hidden="true" />
      )}

      <div className="grid gap-6 mb-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] items-start">
        <ScheduleCard events={events} />
        <CrewCard events={events} />
      </div>

      {revenue && (
        <div className="mb-6">
          <RevenueCard revenue={revenue} />
        </div>
      )}

      <SiteMeasuresTable siteMeasures={recentEstimates} />
    </>
  );
}
