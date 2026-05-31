import type { DashboardKpis } from "@/lib/hooks/useDashboardKPIs";

interface KpiCell {
  label: string;
  value: string;
  delta: string;
  deltaDir: "up" | "down" | "flat";
  sparkHeights: number[];
}

function formatRevenue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function formatDelta(n: number, prefix = ""): string {
  if (n > 0) return `↑ ${prefix}${Math.abs(n)} vs last wk`;
  if (n < 0) return `↓ ${prefix}${Math.abs(n)} vs last wk`;
  return "— same as last wk";
}

function deltaDir(n: number): "up" | "down" | "flat" {
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

function buildCells(kpis: DashboardKpis): KpiCell[] {
  return [
    {
      label: "Site Measures",
      value: String(kpis.estimatesTotal),
      delta: formatDelta(kpis.estimatesDelta),
      deltaDir: deltaDir(kpis.estimatesDelta),
      sparkHeights: [30, 50, 35, 65, 48, 80, 90],
    },
    {
      label: "Estimates Sent",
      value: String(kpis.estimatesSentTotal),
      delta: formatDelta(kpis.estimatesSentDelta),
      deltaDir: deltaDir(kpis.estimatesSentDelta),
      sparkHeights: [60, 55, 62, 58, 60, 65, 60],
    },
    {
      label: "Awaiting Signature",
      value: String(kpis.awaitingSignature),
      delta:
        kpis.expiringSoonCount > 0
          ? `${kpis.expiringSoonCount} expiring soon`
          : "none expiring soon",
      deltaDir: kpis.expiringSoonCount > 0 ? "down" : "flat",
      sparkHeights: [25, 40, 45, 55, 50, 70, 75],
    },
    {
      label: "Win Rate (30d)",
      value: `${kpis.winRate30d}%`,
      delta: formatDelta(kpis.winRateDelta, "").replace("vs last wk", "pt"),
      deltaDir: deltaDir(kpis.winRateDelta),
      sparkHeights: [45, 55, 60, 50, 65, 70, 80],
    },
    {
      label: "Booked Revenue (MTD)",
      value: formatRevenue(kpis.bookedRevenueMtd),
      delta:
        kpis.bookedRevenueDelta >= 0
          ? `↑ ${formatRevenue(kpis.bookedRevenueDelta)}`
          : `↓ ${formatRevenue(Math.abs(kpis.bookedRevenueDelta))}`,
      deltaDir: deltaDir(kpis.bookedRevenueDelta),
      sparkHeights: [20, 35, 45, 55, 70, 80, 95],
    },
  ];
}

const deltaColor: Record<"up" | "down" | "flat", string> = {
  up: "var(--sage)",
  down: "var(--accent)",
  flat: "var(--muted)",
};

interface Props {
  kpis: DashboardKpis;
}

export function KpiPipeline({ kpis }: Props) {
  const cells = buildCells(kpis);

  return (
    <div
      className="grid bg-[var(--surface)] border border-[var(--line)] rounded-[10px] overflow-hidden mb-7"
      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className="group px-6 py-[22px] relative transition-colors hover:bg-[var(--surface-2)]"
          style={{
            borderRight:
              i < cells.length - 1 ? "1px solid var(--line)" : undefined,
          }}
        >
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
            {cell.label}
          </div>
          <div className="text-[30px] font-[700] tracking-[-0.025em] leading-none mb-1.5">
            {cell.value}
          </div>
          <div
            className="font-[var(--font-mono)] text-[11px] flex items-center gap-1.5"
            style={{ color: deltaColor[cell.deltaDir] }}
          >
            {cell.delta}
          </div>
          <div className="flex items-end gap-0.5 mt-2 h-6">
            {cell.sparkHeights.map((h, idx) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
                key={idx}
                className="flex-1 rounded-[1px] transition-colors duration-200 group-hover:bg-[var(--accent)]"
                style={{
                  height: `${h}%`,
                  background: "var(--line-2)",
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
