"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { estTotalArea } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  quote: "text-[var(--gold)]   border-[var(--gold)]/40   bg-[var(--gold)]/7",
  scheduled:
    "text-[var(--sage)]   border-[var(--sage)]/40   bg-[var(--sage)]/7",
  in_progress:
    "text-[var(--accent)] border-[var(--accent)]/40 bg-[var(--accent)]/7",
  completed:
    "text-[var(--ink-2)]  border-[var(--ink-2)]/30  bg-[var(--ink-2)]/5",
};

const STATUS_LABELS: Record<string, string> = {
  quote: "Quote",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export function EstimateListView() {
  const router = useRouter();
  const { data: estimates = [], isLoading } = useEstimates();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--line)]">
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
          All jobs
        </div>
        <h1 className="font-[var(--font-display)] text-[36px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
          Estimates
        </h1>
      </div>

      {/* Column headers — desktop only */}
      <div className="hidden md:grid grid-cols-[80px_2fr_1fr_100px_100px] gap-3 px-4 py-2 bg-[var(--surface-2)] border-b border-[var(--line)] font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
        <span>#</span>
        <span>Customer</span>
        <span>Date</span>
        <span>Status</span>
        <span className="text-right">Area</span>
      </div>

      {isLoading ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
          Loading…
        </p>
      ) : estimates.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
          No estimates yet. Create one from a customer record.
        </p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {estimates.map((est) => {
            const area = est.items ? estTotalArea(est.items) : 0;
            const dateLabel = new Date(est.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "2-digit",
            });
            const statusStyle =
              STATUS_STYLES[est.status] ?? STATUS_STYLES.quote;
            const statusLabel = STATUS_LABELS[est.status] ?? est.status;

            return (
              <button
                key={est.id}
                type="button"
                onClick={() => router.push(`/estimates/${est.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_2fr_1fr_100px_100px] gap-x-3 gap-y-0 px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] hidden md:block self-center">
                  #{est.id}
                </span>

                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] md:hidden">
                        #{est.id} ·{" "}
                      </span>
                      <span className="font-[var(--font-display)] text-[14px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
                        {est.customer?.name ?? "—"}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "md:hidden shrink-0 inline-block border px-2 py-0.5 rounded-[4px]",
                        "font-[var(--font-mono)] text-[9px] uppercase tracking-[.04em]",
                        statusStyle
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {est.customer?.address && (
                    <span className="block font-[var(--font-mono)] text-[11px] text-[var(--muted)] truncate mt-0.5">
                      {est.customer.address}
                    </span>
                  )}
                  <div className="flex items-center gap-3 mt-1 md:hidden">
                    <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                      {dateLabel}
                    </span>
                    {area > 0 && (
                      <span className="font-[var(--font-mono)] text-[10px] text-[var(--ink-2)]">
                        {Math.round(area)} sf
                      </span>
                    )}
                  </div>
                </div>

                <span className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] hidden md:block self-center">
                  {dateLabel}
                </span>
                <span className="hidden md:flex items-center">
                  <span
                    className={cn(
                      "inline-block border px-2 py-0.5 rounded-[4px]",
                      "font-[var(--font-mono)] text-[9px] uppercase tracking-[.04em]",
                      statusStyle
                    )}
                  >
                    {statusLabel}
                  </span>
                </span>
                <span className="font-[var(--font-mono)] text-[12px] text-right text-[var(--ink-2)] hidden md:block self-center">
                  {area > 0 ? `${Math.round(area)} sf` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
