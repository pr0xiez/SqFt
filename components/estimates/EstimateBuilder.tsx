"use client";

import Link from "next/link";
import { useState } from "react";
import { EstimateLockBanner } from "@/components/estimates/EstimateLockBanner";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { ReviseButton } from "@/components/estimates/ReviseButton";
import { SendEstimateDialog } from "@/components/estimates/SendEstimateDialog";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { isEstimateLocked } from "@/lib/estimateStatus";
import { computeEstimateView } from "@/lib/estimateView";
import { useEstimate, useUpdateEstimate } from "@/lib/hooks/useEstimates";
import { useLineItemTemplates } from "@/lib/hooks/useLineItemTemplates";
import type { RoomItem } from "@/lib/utils";

interface Props {
  estimateId: number;
}

export function EstimateBuilderView({ estimateId }: Props) {
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const { data: templates = [] } = useLineItemTemplates();
  const updateEstimate = useUpdateEstimate(estimateId);
  const { showToast } = useToast();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

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

  const locked = isEstimateLocked(estimate.status);

  const rooms = (estimate.siteMeasure.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );

  const estimateView = computeEstimateView({
    lineItems: estimate.lineItems ?? [],
    items: estimate.siteMeasure.items,
    markupPct: estimate.markupPct,
    depositPct: estimate.depositPct,
  });

  return (
    <>
      {/* Revision chain links */}
      {(estimate.revisedFrom ||
        (estimate.revisedBy && estimate.revisedBy.length > 0)) && (
        <div className="mb-3 font-[var(--font-mono)] text-[11px] text-[var(--muted)] flex gap-3 flex-wrap">
          {estimate.revisedFrom && (
            <a
              href={`/estimates/${estimate.revisedFrom.id}`}
              className="text-[var(--accent)] underline"
            >
              ← Revision of E#{estimate.revisedFrom.estimateNumber}
            </a>
          )}
          {estimate.revisedBy?.map((rev) => (
            <a
              key={rev.id}
              href={`/estimates/${rev.id}`}
              className="text-[var(--accent)] underline"
            >
              Revised by E#{rev.estimateNumber} →
            </a>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Estimate #{estimate.estimateNumber}{" "}
            <span className="font-[400] text-[var(--ink-2)]">
              · {estimate.status}
            </span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/site-measures/${estimate.siteMeasureId}`}>
            <Button variant="ghost">← Back to site measure</Button>
          </Link>
          {!locked && (
            <Button variant="primary" onClick={() => setSendDialogOpen(true)}>
              Send to customer →
            </Button>
          )}
          {locked && <ReviseButton estimateId={estimate.id} />}
        </div>
      </div>

      {/* Lock banner — shown when estimate is accepted or declined */}
      {locked && (
        <EstimateLockBanner
          status={estimate.status as "approved" | "declined"}
          approvedAt={estimate.approvedAt ?? null}
          declinedAt={estimate.declinedAt ?? null}
          declineReason={estimate.declineReason ?? null}
          declineSource={estimate.estimateEvents?.[0]?.source ?? null}
          supersededByEstimateNumber={
            (
              estimate.estimateEvents?.[0]?.metadata as {
                supersededByEstimateNumber?: number;
              } | null
            )?.supersededByEstimateNumber ?? null
          }
        />
      )}

      {/* Customer bar */}
      {estimate.siteMeasure.location?.customer && (
        <div className="flex items-center gap-3.5 px-[18px] py-[14px] bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] rounded-lg mb-4">
          <div className="flex-1">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] mb-0.5">
              Customer
            </div>
            <div className="text-[16px] font-[600] tracking-[-0.01em]">
              {estimate.siteMeasure.location.customer.name}
            </div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {estimate.siteMeasure.location.address ?? ""}
            </div>
          </div>
        </div>
      )}

      {/* Line Items + inline totals/settings */}
      <LineItemSection
        lineItems={estimate.lineItems ?? []}
        rooms={rooms}
        markupPct={estimate.markupPct}
        depositPct={estimate.depositPct}
        readOnly={locked}
        templates={templates}
        onSave={async (patch) => {
          try {
            await updateEstimate.mutateAsync(patch);
            showToast("Saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      <InvoicesSection
        estimateId={estimateId}
        estimateTotal={estimateView.total}
        defaultDepositPct={estimate.org?.defaultDepositPct ?? 0.3}
      />

      <SendEstimateDialog
        estimateId={estimate.id}
        estimateNumber={estimate.estimateNumber}
        orgName={estimate.org?.name ?? ""}
        customerEmail={estimate.siteMeasure.location?.customer?.email ?? null}
        hasToken={Boolean(estimate.approvalToken)}
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
      />
    </>
  );
}
