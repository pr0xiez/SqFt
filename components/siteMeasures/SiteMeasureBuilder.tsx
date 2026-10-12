"use client";

import { useRouter } from "next/navigation";
import { RoomSection } from "@/components/siteMeasures/RoomSection";
import { SiteMeasureEstimatesCard } from "@/components/siteMeasures/SiteMeasureEstimatesCard";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingLine } from "@/components/ui/EmptyState";
import { ArrowRightIcon } from "@/components/ui/icons";
import {
  Breadcrumbs,
  MetaSep,
  PageHeader,
  recordTrail,
} from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useCreateEstimate } from "@/lib/hooks/useEstimates";
import {
  useSiteMeasure,
  useUpdateSiteMeasure,
} from "@/lib/hooks/useSiteMeasures";
import { estTotalArea, formatShortDate } from "@/lib/utils";

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
    return <LoadingLine label="Loading site measure…" className="py-8" />;
  }

  if (!siteMeasure) {
    return <ErrorState message="Site measure not found." className="px-0" />;
  }

  const rooms = (siteMeasure.items ?? []).filter((i) => i.type === "room");
  const totalArea = estTotalArea(siteMeasure.items ?? []);
  const location = siteMeasure.location;

  return (
    <>
      <PageHeader
        kicker={
          <Breadcrumbs items={recordTrail({ customer: location?.customer })} />
        }
        title={`Site Measure #${siteMeasure.siteMeasureNumber ?? siteMeasure.id}`}
        meta={
          <>
            <span>{formatShortDate(siteMeasure.date)}</span>
            <MetaSep />
            <span>
              <span className="type-figure text-[var(--ink-2)]">
                {rooms.length}
              </span>{" "}
              room{rooms.length === 1 ? "" : "s"}
            </span>
            <MetaSep />
            <span>
              <span className="type-figure text-[var(--ink-2)]">
                {Math.round(totalArea)}
              </span>{" "}
              sqft
            </span>
          </>
        }
        actions={
          <Button
            variant="primary"
            onClick={handleCreateEstimate}
            disabled={createEstimate.isPending}
          >
            {createEstimate.isPending ? "Creating…" : "+ Create Estimate"}
          </Button>
        }
      />

      {/* Location / customer */}
      {location && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 md:px-5 mb-4">
          <div className="flex-1 min-w-0">
            <div className="type-label mb-1">
              {location.label ? `Location · ${location.label}` : "Location"}
            </div>
            <div className="text-[16px] font-[600] tracking-[-0.01em]">
              {location.customer?.name ?? "-"}
            </div>
            <div className="text-[14px] text-[var(--muted)] mt-0.5">
              {location.address}
            </div>
          </div>
          {location.customer && (
            <Button
              size="sm"
              onClick={() =>
                router.push(`/customers/${siteMeasure.location?.customer?.id}`)
              }
            >
              View customer
              <ArrowRightIcon aria-hidden="true" />
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
