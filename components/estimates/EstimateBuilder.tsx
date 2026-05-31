"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EstimateLockBanner } from "@/components/estimates/EstimateLockBanner";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { ReviseButton } from "@/components/estimates/ReviseButton";
import { SendEstimateDialog } from "@/components/estimates/SendEstimateDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  useEstimate,
  useRotateEstimateToken,
  useUpdateEstimate,
} from "@/lib/hooks/useEstimates";
import { useLineItemTemplates } from "@/lib/hooks/useLineItemTemplates";
import { estTotalArea, type RoomItem } from "@/lib/utils";

interface Props {
  estimateId: number;
}

export function EstimateBuilderView({ estimateId }: Props) {
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const { data: templates = [] } = useLineItemTemplates();
  const updateEstimate = useUpdateEstimate(estimateId);
  const rotateToken = useRotateEstimateToken(estimateId);
  const { showToast } = useToast();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        actionsRef.current &&
        !actionsRef.current.contains(e.target as Node)
      ) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsOpen]);

  async function copyShareLink(forceNew: boolean) {
    setActionsOpen(false);
    try {
      let token = estimate?.approvalToken ?? null;
      if (!token || forceNew) {
        const res = await rotateToken.mutateAsync();
        token = res.approvalToken;
      }
      const url = `${window.location.origin}/q/${token}`;
      await navigator.clipboard.writeText(url);
      showToast(forceNew ? "New link copied" : "Link copied");
    } catch {
      showToast("Failed to generate link");
    }
  }

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

  const locked =
    estimate.status === "approved" || estimate.status === "declined";

  const rooms = (estimate.siteMeasure.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );
  const grossArea = Math.round(estTotalArea(estimate.siteMeasure.items ?? []));

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
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            Estimate #{estimate.estimateNumber} · {estimate.status} ·{" "}
            {new Date(estimate.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Line Items &amp; Pricing
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            Tied to Site Measure #
            {estimate.siteMeasure.siteMeasureNumber ?? estimate.siteMeasure.id}{" "}
            · {rooms.length} room{rooms.length === 1 ? "" : "s"} · {grossArea}{" "}
            sqft
          </div>
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
          <div className="relative" ref={actionsRef}>
            <Button
              variant="ghost"
              onClick={() => setActionsOpen((v) => !v)}
              aria-label="More actions"
              type="button"
            >
              ⋮
            </Button>
            {actionsOpen && (
              <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg z-10 min-w-[180px] py-1">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 font-[var(--font-mono)] text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => copyShareLink(false)}
                  disabled={rotateToken.isPending}
                >
                  {estimate.approvalToken
                    ? "Copy share link"
                    : "Create share link"}
                </button>
                {estimate.approvalToken ? (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 font-[var(--font-mono)] text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => copyShareLink(true)}
                    disabled={rotateToken.isPending}
                  >
                    Regenerate link
                  </button>
                ) : null}
              </div>
            )}
          </div>
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
        convenienceFeeRate={estimate.convenienceFeeRate}
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
