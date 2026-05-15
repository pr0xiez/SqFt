"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { QuoteSummary } from "@/components/estimates/QuoteSummary";
import { SendQuoteDialog } from "@/components/quotes/SendQuoteDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  useQuote,
  useRotateQuoteToken,
  useUpdateQuote,
} from "@/lib/hooks/useQuotes";
import { estTotalArea, type RoomItem } from "@/lib/utils";

interface Props {
  quoteId: number;
}

export function QuoteBuilderView({ quoteId }: Props) {
  const { data: quote, isLoading } = useQuote(quoteId);
  const updateQuote = useUpdateQuote(quoteId);
  const rotateToken = useRotateQuoteToken(quoteId);
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
      let token = quote?.approvalToken ?? null;
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
        Loading quote…
      </p>
    );
  }

  if (!quote) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] py-8">
        Quote not found.
      </p>
    );
  }

  const rooms = (quote.estimate.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );
  const grossArea = Math.round(estTotalArea(quote.estimate.items ?? []));

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            Quote #{quote.quoteNumber} · {quote.status} ·{" "}
            {new Date(quote.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {quote.status === "accepted" && (
              <Link
                href={`/quotes/${quote.id}/signed`}
                className="ml-3 font-[var(--font-mono)] text-[11px] text-[var(--accent)] underline"
              >
                View signed quote →
              </Link>
            )}
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Line Items &amp; Pricing
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            Tied to Estimate #
            {quote.estimate.estimateNumber ?? quote.estimate.id} ·{" "}
            {rooms.length} room{rooms.length === 1 ? "" : "s"} · {grossArea}{" "}
            sqft
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/estimates/${quote.estimateId}`}>
            <Button variant="ghost">← Back to estimate</Button>
          </Link>
          <Button variant="primary" onClick={() => setSendDialogOpen(true)}>
            Send to customer →
          </Button>
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
                  {quote.approvalToken
                    ? "Copy share link"
                    : "Create share link"}
                </button>
                {quote.approvalToken ? (
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

      {/* Customer bar */}
      {quote.estimate.customer && (
        <div className="flex items-center gap-3.5 px-[18px] py-[14px] bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] rounded-lg mb-4">
          <div className="flex-1">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] mb-0.5">
              Customer
            </div>
            <div className="text-[16px] font-[600] tracking-[-0.01em]">
              {quote.estimate.customer.name}
            </div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {quote.estimate.customer.address ?? ""}
            </div>
          </div>
        </div>
      )}

      {/* Line Items */}
      <LineItemSection
        lineItems={quote.lineItems ?? []}
        rooms={rooms}
        taxRate={quote.taxRate}
        markupPct={quote.markupPct}
        onSave={async (lineItems) => {
          try {
            await updateQuote.mutateAsync({ lineItems });
            showToast("Saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      {/* Quote Summary */}
      <QuoteSummary
        lineItems={quote.lineItems ?? []}
        rooms={rooms}
        taxRate={quote.taxRate}
        markupPct={quote.markupPct}
        depositPct={quote.depositPct}
        onSave={async (data) => {
          try {
            await updateQuote.mutateAsync(data);
            showToast("Quote settings saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      <SendQuoteDialog
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        orgName={quote.org?.name ?? ""}
        customerEmail={quote.estimate.customer?.email ?? null}
        hasToken={Boolean(quote.approvalToken)}
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
      />
    </>
  );
}
