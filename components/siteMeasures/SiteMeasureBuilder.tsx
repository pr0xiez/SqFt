"use client";

import { useRouter } from "next/navigation";
import { RoomSection } from "@/components/siteMeasures/RoomSection";
import { SiteMeasureEstimatesCard } from "@/components/siteMeasures/SiteMeasureEstimatesCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Site Measure #{siteMeasure.siteMeasureNumber ?? siteMeasure.id}
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {new Date(siteMeasure.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
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

      {/* Location / customer bar */}
      {siteMeasure.location && (
        <div className="flex items-center gap-3.5 px-[18px] py-[14px] bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] rounded-lg mb-4">
          <div className="flex-1">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] mb-0.5">
              {siteMeasure.location.label
                ? `Location · ${siteMeasure.location.label}`
                : "Location"}
            </div>
            <div className="text-[16px] font-[600] tracking-[-0.01em]">
              {siteMeasure.location.customer?.name ?? "—"}
            </div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {siteMeasure.location.address}
            </div>
          </div>
          {siteMeasure.location.customer && (
            <Button
              size="sm"
              onClick={() =>
                router.push(`/customers/${siteMeasure.location?.customer?.id}`)
              }
            >
              View customer
            </Button>
          )}
        </div>
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
