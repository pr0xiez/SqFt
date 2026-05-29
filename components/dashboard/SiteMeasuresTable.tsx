"use client";

import { useRouter } from "next/navigation";
import type { SiteMeasure } from "@/lib/hooks/useSiteMeasures";

function formatAge(dateStr: string): { label: string; overdue: boolean } {
  const diff = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return { label: "today", overdue: false };
  if (diff === 1) return { label: "1d ago", overdue: false };
  return { label: `${diff}d ago`, overdue: diff > 10 };
}

function getLatestEstimate(est: SiteMeasure) {
  const estimates = est.estimates ?? [];
  if (estimates.length === 0) return null;
  return estimates.reduce((latest, q) =>
    new Date(q.createdAt) > new Date(latest.createdAt) ? q : latest
  );
}

const statusStyles: Record<
  string,
  { bg: string; color: string; strikethrough?: boolean }
> = {
  sent: { bg: "rgba(176,122,26,.1)", color: "var(--gold)" },
  viewed: { bg: "rgba(61,107,74,.1)", color: "var(--sage)" },
  approved: { bg: "var(--accent)", color: "#fff" },
  declined: {
    bg: "rgba(20,18,12,.06)",
    color: "var(--ink-2)",
    strikethrough: true,
  },
};

interface Props {
  siteMeasures: SiteMeasure[];
}

export function SiteMeasuresTable({ siteMeasures }: Props) {
  const router = useRouter();

  return (
    <section
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <header className="flex items-baseline justify-between mb-[18px] pb-[14px] border-b border-[var(--line)]">
        <div className="text-[14px] font-[600] tracking-[-0.01em] flex items-center gap-2.5">
          Recent site measures
          <span className="font-[var(--font-mono)] text-[10px] px-[7px] py-[2px] border border-[var(--line)] rounded-[10px] text-[var(--muted)] font-[500]">
            last 8 created
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/site-measures")}
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink)] tracking-[.02em]"
        >
          View all →
        </button>
      </header>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            {(["#", "Customer", "Estimate", "Amount", "Age"] as const).map(
              (h, i) => (
                <th
                  key={h}
                  className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] font-[500] pb-3 border-b border-[var(--line)]"
                  style={{
                    textAlign: i >= 3 ? "right" : "left",
                    paddingLeft: "12px",
                    paddingRight: "12px",
                  }}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {siteMeasures.map((est) => {
            const latestEstimate = getLatestEstimate(est);
            const age = formatAge(est.createdAt);
            const estimateVersions = est.estimates?.length ?? 0;
            const estimateStatus = latestEstimate?.status;
            const statusStyle = estimateStatus
              ? statusStyles[estimateStatus]
              : null;

            return (
              <tr
                key={est.id}
                onClick={() => router.push(`/site-measures/${est.id}`)}
                className="transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
              >
                <td className="py-3.5 px-3 border-b border-dashed border-[var(--line)]">
                  <span className="font-[var(--font-mono)] text-[11.5px] font-[600] text-[var(--ink-2)]">
                    #{est.siteMeasureNumber ?? est.id}
                  </span>
                </td>

                <td className="py-3.5 px-3 border-b border-dashed border-[var(--line)]">
                  <div className="text-[13px] font-[600] tracking-[-0.01em]">
                    {est.location?.customer?.name ?? "—"}
                  </div>
                  {est.location?.address && (
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                      {est.location.address.split(",")[0]}
                      {est.title ? ` · ${est.title}` : ""}
                    </div>
                  )}
                </td>

                <td className="py-3.5 px-3 border-b border-dashed border-[var(--line)]">
                  {statusStyle ? (
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.08em] px-[9px] py-[3px] rounded-[11px] font-[600]"
                        style={{
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          textDecoration: statusStyle.strikethrough
                            ? "line-through"
                            : undefined,
                        }}
                      >
                        {estimateStatus}
                      </span>
                      {estimateVersions > 1 && (
                        <span className="font-[var(--font-mono)] text-[9.5px] text-[var(--muted)] tracking-[.02em]">
                          {estimateVersions} versions sent
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] italic flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full border border-dashed border-[var(--line-2)]" />
                      No estimate yet
                    </span>
                  )}
                </td>

                <td
                  className="py-3.5 px-3 border-b border-dashed border-[var(--line)] font-[var(--font-mono)] text-[13px] font-[600] tracking-[-0.02em]"
                  style={{ textAlign: "right" }}
                >
                  <span style={{ color: "var(--muted)" }}>—</span>
                </td>

                <td
                  className="py-3.5 px-3 border-b border-dashed border-[var(--line)] font-[var(--font-mono)] text-[10.5px]"
                  style={{
                    textAlign: "right",
                    color: age.overdue ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {age.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
