"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CaretRightIcon, CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  estimateStatusTone,
  isOpenEstimate,
  lastTouchAt,
  relativeTime,
} from "@/lib/estimateStatus";
import type { CustomerSiteMeasureSummary } from "@/lib/hooks/useCustomers";
import { fmtDollar, formatShortDate } from "@/lib/utils";

type PipelineSiteMeasure = CustomerSiteMeasureSummary & {
  locationId: number;
  locationAddress: string;
};

interface Props {
  siteMeasures: PipelineSiteMeasure[];
  openCount: number;
  onStartSiteMeasure: () => void;
  onOpenSiteMeasure: (id: number) => void;
  onOpenEstimate: (id: number) => void;
  isStarting: boolean; // createSiteMeasure.isPending
}

/** Quiet trailing "Open" affordance; the whole row is the button. */
function OpenHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-[500] text-[var(--muted)] transition-colors group-hover:text-[var(--ink)]">
      <span className="hidden sm:inline">Open</span>
      <CaretRightIcon
        aria-hidden="true"
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
      />
    </span>
  );
}

function SiteMeasureRow({
  siteMeasure,
  onOpenSiteMeasure,
  onOpenEstimate,
}: {
  siteMeasure: CustomerSiteMeasureSummary;
  onOpenSiteMeasure: () => void;
  onOpenEstimate: (id: number) => void;
}) {
  const estimates = siteMeasure.estimates ?? [];
  const openCount = estimates.filter(isOpenEstimate).length;
  const acceptedCount = estimates.filter((q) => q.status === "approved").length;

  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      {/* Site measure header */}
      <button
        type="button"
        onClick={onOpenSiteMeasure}
        className="group w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1 px-5 md:px-6 py-3 bg-[var(--surface-2)] hover:bg-[var(--hover)] transition-colors duration-150 cursor-pointer"
      >
        <span className="text-[14px] font-[600] shrink-0">
          Site Measure{" "}
          <span className="type-figure">
            #{siteMeasure.siteMeasureNumber ?? siteMeasure.id}
          </span>
        </span>
        <span className="text-[13px] text-[var(--muted)]">
          {formatShortDate(siteMeasure.date)}
        </span>
        <div className="flex-1 min-w-0" />
        <div className="flex items-center gap-3 shrink-0 text-[13px]">
          {acceptedCount > 0 && (
            <span className="inline-flex items-center gap-1 font-[560] text-[var(--ok)]">
              <CheckIcon
                aria-hidden="true"
                weight="bold"
                className="size-3.5"
              />
              <span className="type-figure">{acceptedCount}</span> accepted
            </span>
          )}
          {openCount > 0 && (
            <span className="font-[560] text-[var(--warn)]">
              <span className="type-figure">{openCount}</span> open
            </span>
          )}
          <OpenHint />
        </div>
      </button>

      {/* Estimate thread */}
      {estimates.length === 0 ? (
        <div className="px-5 md:px-6 py-3 text-[13px] text-[var(--muted)]">
          No estimates drafted on this site measure yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {estimates.map((q) => {
            const tone = estimateStatusTone(q.status);
            const touch = lastTouchAt(q);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onOpenEstimate(q.id)}
                  className="group w-full text-left flex items-center gap-3 px-5 md:px-6 py-3 hover:bg-[var(--hover)] cursor-pointer transition-colors duration-150"
                >
                  <span className="type-figure text-[13.5px] font-[600] text-[var(--ink)] min-w-[52px]">
                    E#{q.estimateNumber}
                  </span>
                  <StatusBadge status={q.status} />
                  <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px] text-[var(--muted)]">
                    <span className="truncate">
                      {tone.label} {relativeTime(touch)}
                    </span>
                    <span className="hidden sm:inline whitespace-nowrap">
                      ·{" "}
                      <span className="type-figure">{q._count.lineItems}</span>{" "}
                      line item
                      {q._count.lineItems === 1 ? "" : "s"}
                    </span>
                  </div>
                  {q.total != null && (
                    <span className="type-figure text-[13.5px] font-[560] text-[var(--ink-2)] shrink-0">
                      {fmtDollar(q.total)}
                    </span>
                  )}
                  <OpenHint />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CustomerPipeline({
  siteMeasures,
  openCount,
  onStartSiteMeasure,
  onOpenSiteMeasure,
  onOpenEstimate,
  isStarting,
}: Props) {
  return (
    <Card
      flush
      title="Pipeline"
      sub="Site measures & estimates"
      action={
        openCount > 0 ? (
          <span className="text-[13px] font-[560] text-[var(--warn)]">
            <span className="type-figure">{openCount}</span> awaiting
          </span>
        ) : null
      }
      className="overflow-hidden"
    >
      {siteMeasures.length === 0 ? (
        <div className="px-5 md:px-6 pt-4 pb-10 text-center border-t border-[var(--line)]">
          <p className="text-[14px] text-[var(--muted)] mb-3">
            No site measures yet.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={onStartSiteMeasure}
            disabled={isStarting}
          >
            + Start first site measure
          </Button>
        </div>
      ) : (
        <div className="border-t border-[var(--line)]">
          {siteMeasures.map((est) => (
            <SiteMeasureRow
              key={est.id}
              siteMeasure={est}
              onOpenSiteMeasure={() => onOpenSiteMeasure(est.id)}
              onOpenEstimate={onOpenEstimate}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
