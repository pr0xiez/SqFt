"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { CardLink } from "@/components/ui/CardLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  CELL,
  CELL_FIGURE,
  CELL_PRIMARY,
  CELL_SUB,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_ROW,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { SiteMeasure } from "@/lib/hooks/useSiteMeasures";

function formatAge(dateStr: string): { label: string; overdue: boolean } {
  const diff = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return { label: "Today", overdue: false };
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

const GRID_COLS =
  "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[88px_minmax(0,1fr)_minmax(0,220px)_96px]";

interface Props {
  siteMeasures: SiteMeasure[];
}

export function SiteMeasuresTable({ siteMeasures }: Props) {
  const router = useRouter();

  return (
    <Card
      flush
      title="Recent site measures"
      sub="The last 8 created"
      action={<CardLink href="/site-measures">View all</CardLink>}
    >
      <div className={cn(TABLE_HEAD, GRID_COLS, "border-t")}>
        <div className={TABLE_HEAD_CELL}>#</div>
        <div className={TABLE_HEAD_CELL}>Customer</div>
        <div className={TABLE_HEAD_CELL}>Latest estimate</div>
        <div className={cn(TABLE_HEAD_CELL, "text-right")}>Age</div>
      </div>
      {siteMeasures.length === 0 ? (
        <p className="px-5 md:px-6 py-6 border-t border-[var(--line)] md:border-t-0 text-[14px] text-[var(--muted)]">
          No site measures yet.
        </p>
      ) : (
        <div className="border-t border-[var(--line)] md:border-t-0">
          {siteMeasures.map((est) => {
            const latestEstimate = getLatestEstimate(est);
            const age = formatAge(est.createdAt);
            const estimateVersions = est.estimates?.length ?? 0;

            return (
              <button
                key={est.id}
                type="button"
                onClick={() => router.push(`/site-measures/${est.id}`)}
                className={cn(TABLE_ROW, GRID_COLS, "py-3")}
              >
                <div className={cn(CELL, "hidden md:block")}>
                  <span
                    className={cn(
                      CELL_FIGURE,
                      "font-[600] text-[var(--ink-2)]"
                    )}
                  >
                    #{est.siteMeasureNumber ?? est.id}
                  </span>
                </div>
                <div className={cn(CELL, "min-w-0")}>
                  <div className={cn(CELL_PRIMARY, "truncate")}>
                    {est.location?.customer?.name ?? "-"}
                  </div>
                  {est.location?.address && (
                    <div className={CELL_SUB}>
                      {est.location.address.split(",")[0]}
                    </div>
                  )}
                  {/* phones: estimate status folds under the name */}
                  <div className="md:hidden mt-1.5">
                    {latestEstimate ? (
                      <StatusBadge status={latestEstimate.status} />
                    ) : (
                      <span className="text-[13px] text-[var(--muted)]">
                        No estimate yet
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    CELL,
                    "hidden md:flex items-center gap-2 min-w-0"
                  )}
                >
                  {latestEstimate ? (
                    <>
                      <StatusBadge status={latestEstimate.status} />
                      {estimateVersions > 1 && (
                        <span className="text-[13px] text-[var(--muted)] whitespace-nowrap">
                          {estimateVersions} versions
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[13.5px] text-[var(--muted)]">
                      No estimate yet
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    CELL,
                    "text-right text-[13.5px] whitespace-nowrap self-start md:self-center",
                    age.overdue
                      ? "text-[var(--accent-ink)] font-[560]"
                      : "text-[var(--muted)]"
                  )}
                >
                  {age.label}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
