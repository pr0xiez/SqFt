"use client";

import { Button } from "@/components/ui/Button";
import {
  estimateStatusTone,
  isOpenEstimate,
  lastTouchAt,
  relativeTime,
} from "@/lib/estimateStatus";
import type { CustomerSiteMeasureSummary } from "@/lib/hooks/useCustomers";
import { formatShortDate } from "@/lib/utils";

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

function StatusPill({ status }: { status: string }) {
  const tone = estimateStatusTone(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.08em] px-2 py-[3px] rounded-[4px] border"
      style={{
        color: tone.fg,
        borderColor: tone.border,
        background: tone.bg,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
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
    <div className="border border-[var(--line)] rounded-md overflow-hidden">
      {/* SiteMeasure header */}
      <button
        type="button"
        onClick={onOpenSiteMeasure}
        className="w-full text-left flex items-center gap-3 px-4 py-3 bg-[var(--surface-2)] hover:bg-[color-mix(in_srgb,var(--surface-2)_70%,var(--line))] transition-colors duration-150 cursor-pointer"
      >
        <span className="font-[var(--font-mono)] text-[10.5px] uppercase tracking-[.09em] text-[var(--muted)] shrink-0">
          Site Measure{" "}
          <span className="text-[var(--ink)]">
            #{siteMeasure.siteMeasureNumber ?? siteMeasure.id}
          </span>
        </span>
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
          {formatShortDate(siteMeasure.date)}
        </span>
        <div className="flex-1 min-w-0">
          {siteMeasure.title && (
            <span className="text-[12.5px] font-[600] tracking-[-0.005em] truncate block">
              {siteMeasure.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {acceptedCount > 0 && (
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--sage)] uppercase tracking-[.08em]">
              ✓ Accepted
            </span>
          )}
          {openCount > 0 && (
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--gold)] uppercase tracking-[.08em]">
              {openCount} open
            </span>
          )}
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
            Open →
          </span>
        </div>
      </button>

      {/* Estimate thread */}
      {estimates.length === 0 ? (
        <div className="px-4 py-3 font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] italic">
          No estimates drafted on this site measure yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {estimates.map((q) => {
            const tone = estimateStatusTone(q.status);
            const touch = lastTouchAt(q);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onOpenEstimate(q.id)}
                  className="w-full text-left flex items-center gap-3 pl-4 pr-4 py-3 hover:bg-[var(--surface-2)] cursor-pointer transition-[background,padding] duration-[120ms] hover:pl-5 group"
                  style={{
                    borderLeft: `3px solid ${tone.fg}`,
                  }}
                >
                  <span className="font-[var(--font-mono)] text-[11px] font-[600] tabular-nums text-[var(--ink)] min-w-[44px]">
                    E#{q.estimateNumber}
                  </span>
                  <StatusPill status={q.status} />
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] tracking-[.02em]">
                      {q.status === "approved"
                        ? "Approved"
                        : q.status === "declined"
                          ? "Declined"
                          : q.status === "viewed"
                            ? "Viewed"
                            : q.status === "sent"
                              ? "Sent"
                              : "Created"}{" "}
                      {relativeTime(touch)}
                    </span>
                    <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] hidden sm:inline">
                      · {q._count.lineItems} line item
                      {q._count.lineItems === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">
                    Open →
                  </span>
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
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-[700] tracking-[-0.015em]">
            Pipeline
          </h2>
          <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] uppercase tracking-[.08em] mt-0.5">
            Site measures & estimates
          </div>
        </div>
        {openCount > 0 && (
          <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--gold)] uppercase tracking-[.08em]">
            {openCount} awaiting
          </div>
        )}
      </div>

      {siteMeasures.length === 0 ? (
        <div className="py-10 text-center">
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mb-3">
            No site measures yet.
          </div>
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
        <div className="flex flex-col gap-3">
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
    </div>
  );
}
