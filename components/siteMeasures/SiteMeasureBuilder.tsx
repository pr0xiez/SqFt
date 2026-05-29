"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerPickerPanel } from "@/components/siteMeasures/CustomerPickerPanel";
import { RoomSection } from "@/components/siteMeasures/RoomSection";
import { SiteMeasureEstimatesCard } from "@/components/siteMeasures/SiteMeasureEstimatesCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useCreateEstimate } from "@/lib/hooks/useEstimates";
import {
  useSiteMeasure,
  useUpdateSiteMeasure,
} from "@/lib/hooks/useSiteMeasures";
import { estTotalArea } from "@/lib/utils";

interface Props {
  siteMeasureId: number;
}

export function SiteMeasureBuilderView({ siteMeasureId }: Props) {
  const router = useRouter();
  const { data: siteMeasure, isLoading } = useSiteMeasure(siteMeasureId);
  const updateSiteMeasure = useUpdateSiteMeasure(siteMeasureId);
  const createEstimate = useCreateEstimate();
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
    if (trimmed === (siteMeasure?.title ?? "")) return;
    try {
      await updateSiteMeasure.mutateAsync({ title: trimmed });
    } catch {
      showToast("Failed to save title");
    }
  }

  async function handleChangeCustomer(customerId: number) {
    try {
      await updateSiteMeasure.mutateAsync({ customerId });
      showToast("Customer changed");
    } catch {
      showToast("Failed to change customer");
    }
  }

  async function handleCreateEstimate() {
    try {
      const newEstimate = await createEstimate.mutateAsync({ siteMeasureId });
      router.push(`/estimates/${newEstimate.id}`);
    } catch {
      showToast("Failed to create estimate");
    }
  }

  if (isLoading) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-8">
        Loading site measure…
      </p>
    );
  }

  if (!siteMeasure) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] py-8">
        Site measure not found.
      </p>
    );
  }

  const rooms = (siteMeasure.items ?? []).filter((i) => i.type === "room");
  const totalArea = estTotalArea(siteMeasure.items ?? []);

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            Site Measure #{siteMeasure.siteMeasureNumber ?? siteMeasure.id} ·{" "}
            {new Date(siteMeasure.date).toLocaleDateString("en-US", {
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
              placeholder="Untitled site measure"
            />
          ) : (
            <button
              type="button"
              className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em] cursor-text hover:opacity-70 transition-opacity text-left"
              onClick={() => {
                setTitleDraft(siteMeasure.title ?? "");
                setEditingTitle(true);
              }}
              title="Click to edit title"
            >
              {siteMeasure.title || (
                <span className="text-[var(--muted)]">
                  Untitled site measure
                </span>
              )}
            </button>
          )}
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
            {Math.round(totalArea)} sqft
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/site-measures")}>
            ← All site measures
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateEstimate}
            disabled={createEstimate.isPending}
          >
            {createEstimate.isPending ? "Creating…" : "+ Create Estimate"}
          </Button>
        </div>
      </div>

      {/* Customer bar */}
      {siteMeasure.customer && (
        <div className="flex items-center gap-3.5 px-[18px] py-[14px] bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] rounded-lg mb-4">
          <div className="flex-1">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] mb-0.5">
              Customer
            </div>
            <div className="text-[16px] font-[600] tracking-[-0.01em]">
              {siteMeasure.customer.name}
            </div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {siteMeasure.customer.address ?? ""}
            </div>
          </div>
          <Button
            size="sm"
            onClick={() =>
              router.push(`/customers/${siteMeasure.customer?.id}`)
            }
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

      {pickerAnchor && siteMeasure.customer && (
        <CustomerPickerPanel
          customers={customers ?? []}
          currentCustomerId={siteMeasure.customer.id}
          anchorRect={pickerAnchor}
          onSelect={handleChangeCustomer}
          onClose={() => setPickerAnchor(null)}
        />
      )}

      {/* Estimates card */}
      <SiteMeasureEstimatesCard estimates={siteMeasure.estimates ?? []} />

      {/* Rooms */}
      <RoomSection
        siteMeasure={siteMeasure}
        onSave={async (items) => {
          try {
            await updateSiteMeasure.mutateAsync({ items });
            showToast("Saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />
    </>
  );
}
