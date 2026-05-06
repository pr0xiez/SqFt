"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { QuoteSummary } from "@/components/estimates/QuoteSummary";
import { RoomSection } from "@/components/estimates/RoomSection";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useEstimate, useUpdateEstimate } from "@/lib/hooks/useEstimates";
import { useOrg } from "@/lib/hooks/useOrg";
import { estTotalArea } from "@/lib/utils";

const PdfModal = dynamic(() => import("@/components/estimates/PdfModal"), {
  ssr: false,
});

interface Props {
  estimateId: number;
}

export function EstimateBuilderView({ estimateId }: Props) {
  const router = useRouter();
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const { data: org } = useOrg();
  const updateEstimate = useUpdateEstimate(estimateId);
  const { showToast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
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

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  async function saveTitle() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (trimmed === (estimate?.title ?? "")) return;
    try {
      await updateEstimate.mutateAsync({ title: trimmed });
    } catch {
      showToast("Failed to save title");
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

  const rooms = (estimate.items ?? []).filter((i) => i.type === "room");
  const totalArea = estTotalArea(estimate.items ?? []);

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            Estimate #{estimate.id} ·{" "}
            {new Date(estimate.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") titleInputRef.current?.blur();
                if (e.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
              className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em] bg-transparent border-b border-[var(--ink-2)] outline-none w-full max-w-[480px]"
              placeholder="Untitled estimate"
            />
          ) : (
            <button
              type="button"
              className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em] cursor-text hover:opacity-70 transition-opacity text-left"
              onClick={() => {
                setTitleDraft(estimate.title ?? "");
                setEditingTitle(true);
              }}
              title="Click to edit title"
            >
              {estimate.title || (
                <span className="text-[var(--muted)]">Untitled estimate</span>
              )}
            </button>
          )}
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
            {Math.round(totalArea)} sqft
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/estimates")}>
            ← All estimates
          </Button>
          <div className="relative" ref={actionsRef}>
            <Button variant="primary" onClick={() => setActionsOpen((o) => !o)}>
              Actions ▾
            </Button>
            {actionsOpen && (
              <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg z-10 min-w-[160px] py-1">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 font-[var(--font-mono)] text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    setPdfModalOpen(true);
                    setActionsOpen(false);
                  }}
                  disabled={!org}
                >
                  Download PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer bar */}
      {estimate.customer && (
        <div className="flex items-center gap-3.5 px-[18px] py-[14px] bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] rounded-lg mb-4">
          <div className="flex-1">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] mb-0.5">
              Customer
            </div>
            <div className="text-[16px] font-[600] tracking-[-0.01em]">
              {estimate.customer.name}
            </div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {estimate.customer.address ?? ""}
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => router.push(`/customers/${estimate.customer?.id}`)}
          >
            View
          </Button>
        </div>
      )}

      {/* Rooms */}
      <RoomSection
        estimate={estimate}
        onSave={async (items) => {
          try {
            await updateEstimate.mutateAsync({ items });
            showToast("Saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      {/* Line Items */}
      <LineItemSection
        estimate={estimate}
        onSave={async (lineItems) => {
          try {
            await updateEstimate.mutateAsync({ lineItems });
            showToast("Saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      {/* Quote Summary */}
      <QuoteSummary
        estimate={estimate}
        onSave={async (data) => {
          try {
            await updateEstimate.mutateAsync(data);
            showToast("Quote settings saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      {/* PDF modal */}
      {org && (
        <PdfModal
          open={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          estimate={estimate}
          org={org}
        />
      )}
    </>
  );
}
