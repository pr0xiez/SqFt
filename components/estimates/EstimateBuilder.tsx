"use client";

/**
 * EstimateBuilder — Phase 5 (complex screen, full implementation pending)
 * This is a working stub that renders the estimate and allows saving.
 * Full room canvas, L-shape logic, and linked qty are implemented in sub-components.
 */

import { useRouter } from "next/navigation";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { QuoteSummary } from "@/components/estimates/QuoteSummary";
import { RoomSection } from "@/components/estimates/RoomSection";
import { useToast } from "@/components/ui/Toast";
import { useEstimate, useUpdateEstimate } from "@/lib/hooks/useEstimates";

interface Props {
  estimateId: number;
}

export function EstimateBuilderView({ estimateId }: Props) {
  const router = useRouter();
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const updateEstimate = useUpdateEstimate(estimateId);
  const { showToast } = useToast();

  if (isLoading) {
    return (
      <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-8">
        Loading estimate…
      </p>
    );
  }

  if (!estimate) {
    return (
      <p className="font-[var(--font-mono)] text-xs text-vermil py-8">
        Estimate not found.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-[var(--font-mono)] text-[11px] text-driftwood">
        <button
          onClick={() => router.push("/estimates")}
          className="hover:text-oak transition-colors"
        >
          Estimates
        </button>
        <span>/</span>
        {estimate.customer && (
          <>
            <button
              onClick={() => router.push(`/customers/${estimate.customer?.id}`)}
              className="hover:text-oak transition-colors"
            >
              {estimate.customer.name}
            </button>
            <span>/</span>
          </>
        )}
        <span className="text-oak">#{estimate.id}</span>
      </div>

      {/* Header */}
      <div className="pb-3 border-b-2 border-oak">
        <p className="font-[var(--font-label)] text-[11px] italic text-vermil mb-1">
          {estimate.customer?.name}
        </p>
        <h1 className="font-[var(--font-display)] text-[32px] font-black text-oak leading-none tracking-tight">
          Estimate #{estimate.id}
        </h1>
      </div>

      {/* Room measurements */}
      <RoomSection
        estimate={estimate}
        onSave={async (items) => {
          try {
            await updateEstimate.mutateAsync({ items });
            showToast("Saved.");
          } catch {
            showToast("Save failed.");
          }
        }}
      />

      {/* Line items (bill of materials) */}
      <LineItemSection
        estimate={estimate}
        onSave={async (lineItems) => {
          try {
            await updateEstimate.mutateAsync({ lineItems });
            showToast("Saved.");
          } catch {
            showToast("Save failed.");
          }
        }}
      />

      {/* Quote summary */}
      <QuoteSummary
        estimate={estimate}
        onSave={async (data) => {
          try {
            await updateEstimate.mutateAsync(data);
            showToast("Quote settings saved.");
          } catch {
            showToast("Save failed.");
          }
        }}
      />
    </div>
  );
}
