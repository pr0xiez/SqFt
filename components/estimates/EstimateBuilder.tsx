"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerPickerPanel } from "@/components/estimates/CustomerPickerPanel";
import { EstimateQuotesCard } from "@/components/estimates/EstimateQuotesCard";
import { RoomSection } from "@/components/estimates/RoomSection";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimate, useUpdateEstimate } from "@/lib/hooks/useEstimates";
import { useCreateQuote } from "@/lib/hooks/useQuotes";
import { estTotalArea } from "@/lib/utils";

interface Props {
  estimateId: number;
}

export function EstimateBuilderView({ estimateId }: Props) {
  const router = useRouter();
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const updateEstimate = useUpdateEstimate(estimateId);
  const createQuote = useCreateQuote();
  const { showToast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const changeCustomerBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const { data: customers } = useCustomers();

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

  async function handleChangeCustomer(customerId: number) {
    try {
      await updateEstimate.mutateAsync({ customerId });
      showToast("Customer changed");
    } catch {
      showToast("Failed to change customer");
    }
  }

  async function handleCreateQuote() {
    try {
      const newQuote = await createQuote.mutateAsync({ estimateId });
      router.push(`/quotes/${newQuote.id}`);
    } catch {
      showToast("Failed to create quote");
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
            Estimate #{estimate.estimateNumber ?? estimate.id} ·{" "}
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
          <Button
            variant="primary"
            onClick={handleCreateQuote}
            disabled={createQuote.isPending}
          >
            {createQuote.isPending ? "Creating…" : "+ Create Quote"}
          </Button>
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
          <Button
            ref={changeCustomerBtnRef}
            size="sm"
            onClick={() => {
              const rect =
                changeCustomerBtnRef.current?.getBoundingClientRect();
              if (rect) setPickerAnchor(rect);
            }}
          >
            Change
          </Button>
        </div>
      )}

      {pickerAnchor && estimate.customer && (
        <CustomerPickerPanel
          customers={customers ?? []}
          currentCustomerId={estimate.customer.id}
          anchorRect={pickerAnchor}
          onSelect={handleChangeCustomer}
          onClose={() => setPickerAnchor(null)}
        />
      )}

      {/* Quotes card */}
      <EstimateQuotesCard quotes={estimate.quotes ?? []} />

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
    </>
  );
}
