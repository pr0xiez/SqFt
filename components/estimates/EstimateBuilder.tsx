"use client";

import Link from "next/link";
import { useState } from "react";
import { EstimateLockBanner } from "@/components/estimates/EstimateLockBanner";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { ReviseButton } from "@/components/estimates/ReviseButton";
import { SendEstimateDialog } from "@/components/estimates/SendEstimateDialog";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingLine } from "@/components/ui/EmptyState";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  PaperPlaneTiltIcon,
} from "@/components/ui/icons";
import { BackLink, MetaSep, PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
    return <LoadingLine label="Loading estimate…" className="py-8" />;
  }

  if (!estimate) {
    return <ErrorState message="Estimate not found." className="px-0" />;
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

  const customer = estimate.siteMeasure.location?.customer;
  const address = estimate.siteMeasure.location?.address;
  const hasRevisions =
    Boolean(estimate.revisedFrom) || (estimate.revisedBy?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        kicker={
          <>
            <BackLink href={`/site-measures/${estimate.siteMeasureId}`}>
              Back to site measure
            </BackLink>
            {/* Revision chain links */}
            {hasRevisions && <MetaSep />}
            {estimate.revisedFrom && (
              <Link
                href={`/estimates/${estimate.revisedFrom.id}`}
                className="inline-flex items-center gap-1.5 font-[500] text-[var(--accent-ink)] hover:underline"
              >
                <ArrowCounterClockwiseIcon
                  aria-hidden="true"
                  className="size-[14px]"
                />
                Revision of E
                <span className="type-figure">
                  #{estimate.revisedFrom.estimateNumber}
                </span>
              </Link>
            )}
            {estimate.revisedBy?.map((rev) => (
              <Link
                key={rev.id}
                href={`/estimates/${rev.id}`}
                className="group inline-flex items-center gap-1.5 font-[500] text-[var(--accent-ink)] hover:underline"
              >
                Revised by E
                <span className="type-figure">#{rev.estimateNumber}</span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-[14px] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </>
        }
        title={`Estimate #${estimate.estimateNumber}`}
        meta={
          <>
            {/* Locked estimates carry their status in the lock banner. */}
            {!locked && <StatusBadge status={estimate.status} />}
            {customer && (
              <>
                {!locked && <MetaSep />}
                <span className="font-[560] text-[var(--ink-2)]">
                  {customer.name}
                </span>
              </>
            )}
            {customer && address && (
              <>
                <MetaSep />
                <span>{address}</span>
              </>
            )}
          </>
        }
        actions={
          locked ? (
            <ReviseButton estimateId={estimate.id} />
          ) : (
            <Button variant="primary" onClick={() => setSendDialogOpen(true)}>
              <PaperPlaneTiltIcon aria-hidden="true" />
              Send to customer
            </Button>
          )
        }
      />

      {/* Lock banner: shown when the estimate is approved or declined */}
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
        emphasize={estimate.status === "approved"}
      />

      <SendEstimateDialog
        estimateId={estimate.id}
        estimateNumber={estimate.estimateNumber}
        orgName={estimate.org?.name ?? ""}
        customerEmail={estimate.siteMeasure.location?.customer?.email ?? null}
        hasToken={estimate.hasApprovalToken}
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
      />
    </>
  );
}
