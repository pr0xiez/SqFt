"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { estTotalArea } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  quote: "text-gold border-gold/40 bg-gold/7",
  scheduled: "text-sage border-sage/40 bg-sage/7",
  in_progress: "text-vermil border-vermil/40 bg-vermil/7",
  completed: "text-oak border-oak/30 bg-oak/5",
};

const STATUS_LABELS: Record<string, string> = {
  quote: "Quote",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

export function EstimateListView() {
  const router = useRouter();
  const { data: estimates = [], isLoading } = useEstimates();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="pb-3 border-b-2 border-oak">
        <p className="font-[var(--font-label)] text-[11px] italic text-vermil mb-1">
          All jobs
        </p>
        <h1 className="font-[var(--font-display)] text-[36px] font-black text-oak leading-none tracking-tight">
          Estimates
        </h1>
      </div>

      {/* Column headers — desktop only */}
      <div className="hidden md:grid grid-cols-[80px_2fr_1fr_100px_100px] gap-3 px-4 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood border-b border-linen-dd">
        <span>#</span>
        <span>Customer</span>
        <span>Date</span>
        <span>Status</span>
        <span className="text-right">Area</span>
      </div>

      {isLoading ? (
        <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-4">
          Loading…
        </p>
      ) : estimates.length === 0 ? (
        <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-4">
          No estimates yet. Create one from a customer record.
        </p>
      ) : (
        <div className="divide-y divide-linen-dd">
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
                onClick={() => router.push(`/estimates/${est.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_2fr_1fr_100px_100px] gap-x-3 gap-y-0 px-4 py-3 bg-cream hover:bg-linen transition-colors cursor-pointer"
              >
                {/* ID — desktop only (inline on mobile below) */}
                <span className="font-[var(--font-mono)] text-xs text-driftwood hidden md:block self-center">
                  #{est.id}
                </span>

                {/* Customer name + address (always visible) + mobile secondary row */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-[var(--font-mono)] text-[10px] text-driftwood md:hidden">
                        #{est.id} ·{" "}
                      </span>
                      <span className="font-[var(--font-display)] text-sm font-bold text-oak">
                        {est.customer?.name ?? "—"}
                      </span>
                    </div>
                    {/* Mobile-only status badge */}
                    <span
                      className={cn(
                        "md:hidden shrink-0 inline-block border px-2 py-0.5",
                        "font-[var(--font-mono)] text-[10px] uppercase tracking-wider",
                        statusStyle
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {est.customer?.address && (
                    <span className="block font-[var(--font-mono)] text-[11px] text-driftwood truncate">
                      {est.customer.address}
                    </span>
                  )}
                  {/* Mobile-only: date + area */}
                  <div className="flex items-center gap-3 mt-1 md:hidden">
                    <span className="font-[var(--font-mono)] text-[10px] text-driftwood">
                      {dateLabel}
                    </span>
                    {area > 0 && (
                      <span className="font-[var(--font-mono)] text-[10px] text-oak">
                        {Math.round(area)} ft²
                      </span>
                    )}
                  </div>
                </div>

                {/* Desktop-only columns */}
                <span className="font-[var(--font-mono)] text-xs text-driftwood hidden md:block self-center">
                  {dateLabel}
                </span>
                <span className="hidden md:flex items-center">
                  <span
                    className={cn(
                      "inline-block border px-2 py-0.5 font-[var(--font-mono)] text-[10px] uppercase tracking-wider",
                      statusStyle
                    )}
                  >
                    {statusLabel}
                  </span>
                </span>
                <span className="font-[var(--font-mono)] text-xs text-right text-oak hidden md:block self-center">
                  {area > 0 ? `${Math.round(area)} ft²` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
