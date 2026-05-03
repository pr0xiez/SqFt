"use client";

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
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-8">
        Loading estimate…
      </p>
    );
  }

  if (!estimate) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] py-8">
        Estimate not found.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
        <button
          type="button"
          onClick={() => router.push("/estimates")}
          className="hover:text-[var(--ink)] transition-colors"
        >
          Estimates
        </button>
        <span>/</span>
        {estimate.customer && (
          <>
            <button
              type="button"
              onClick={() => router.push(`/customers/${estimate.customer?.id}`)}
              className="hover:text-[var(--ink)] transition-colors"
            >
              {estimate.customer.name}
            </button>
            <span>/</span>
          </>
        )}
        <span className="text-[var(--ink)]">#{estimate.id}</span>
      </div>

      {/* Header */}
      <div className="pb-4 border-b border-[var(--line)]">
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
          {estimate.customer?.name}
        </div>
        <h1 className="font-[var(--font-display)] text-[32px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
          Estimate #{estimate.id}
        </h1>
      </div>

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
