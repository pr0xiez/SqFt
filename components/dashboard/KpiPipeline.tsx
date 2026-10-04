import { Stat } from "@/components/ui/Stat";
import type { DashboardKpis } from "@/lib/hooks/useDashboardKPIs";

type Trend = "up" | "down" | "flat";

interface KpiCell {
  label: string;
  value: string;
  delta: string;
  trend: Trend;
}

function formatRevenue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function formatDelta(n: number, unit = " vs last week"): string {
  if (n > 0) return `+${n}${unit}`;
  if (n < 0) return `${n}${unit}`.replace("-", "−");
  return "Same as last week";
}

function trendOf(n: number): Trend {
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

function buildCells(kpis: DashboardKpis): KpiCell[] {
  return [
    {
      label: "Site measures",
      value: String(kpis.estimatesTotal),
      delta: formatDelta(kpis.estimatesDelta),
      trend: trendOf(kpis.estimatesDelta),
    },
    {
      label: "Estimates sent",
      value: String(kpis.estimatesSentTotal),
      delta: formatDelta(kpis.estimatesSentDelta),
      trend: trendOf(kpis.estimatesSentDelta),
    },
    {
      label: "Awaiting signature",
      value: String(kpis.awaitingSignature),
      delta:
        kpis.expiringSoonCount > 0
          ? `${kpis.expiringSoonCount} expiring soon`
          : "None expiring soon",
      trend: kpis.expiringSoonCount > 0 ? "down" : "flat",
    },
    {
      label: "Win rate, 30 days",
      value: `${kpis.winRate30d}%`,
      delta:
        kpis.winRateDelta === 0
          ? "Same as last week"
          : formatDelta(kpis.winRateDelta, " pts"),
      trend: trendOf(kpis.winRateDelta),
    },
    {
      label: "Booked this month",
      value: formatRevenue(kpis.bookedRevenueMtd),
      delta:
        kpis.bookedRevenueDelta === 0
          ? "Same as last week"
          : kpis.bookedRevenueDelta > 0
            ? `+${formatRevenue(kpis.bookedRevenueDelta)} vs last week`
            : `−${formatRevenue(Math.abs(kpis.bookedRevenueDelta))} vs last week`,
      trend: trendOf(kpis.bookedRevenueDelta),
    },
  ];
}

const trendColor: Record<Trend, string> = {
  up: "text-[var(--ok)]",
  down: "text-[var(--accent-ink)]",
  flat: "text-[var(--muted)]",
};

interface Props {
  kpis: DashboardKpis;
}

/**
 * The KPI strip. Five figures in one bordered band, divided by hairlines; it
 * folds to a 2-column grid on phones instead of scrolling sideways.
 */
export function KpiPipeline({ kpis }: Props) {
  const cells = buildCells(kpis);

  return (
    <div className="card grid grid-cols-2 lg:grid-cols-5 overflow-hidden mb-6">
      {cells.map((cell, i) => {
        const isLast = i === cells.length - 1;
        return (
          <div
            key={cell.label}
            className={[
              "px-5 py-5 md:px-6 md:py-6 border-[var(--line)]",
              // hairlines between cells: 2 columns on phones, 5 from lg up
              i % 2 === 0 && !isLast ? "border-r" : "",
              isLast ? "col-span-2 lg:col-span-1" : "lg:border-r",
              i >= 2 ? "border-t lg:border-t-0" : "",
            ].join(" ")}
          >
            <Stat
              label={cell.label}
              value={cell.value}
              size="md"
              sub={<span className={trendColor[cell.trend]}>{cell.delta}</span>}
            />
          </div>
        );
      })}
    </div>
  );
}
