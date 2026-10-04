"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  QuickCreatePanel,
  type QuickRow,
} from "@/components/quick-create/QuickCreatePanel";
import { useToast } from "@/components/ui/Toast";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCreateEstimate } from "@/lib/hooks/useEstimates";
import { useSiteMeasures } from "@/lib/hooks/useSiteMeasures";

/**
 * Quick estimate: search a customer's site measures and spin up a blank
 * estimate from the chosen one: the same create-and-open-builder action the
 * site-measure page exposes, lifted into the global launcher.
 */
export function QuickEstimatePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const create = useCreateEstimate();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const q = useDebouncedValue(query, 250);

  const { data, isFetching } = useSiteMeasures({
    page: 1,
    perPage: 8,
    sort: "date",
    dir: "desc",
    q,
    status: "all",
  });

  const rows = useMemo<QuickRow[]>(
    () =>
      (data?.items ?? []).map((sm) => {
        const rooms = sm._count?.items;
        const customer = sm.location?.customer?.name ?? "-";
        return {
          id: sm.id,
          title: `№ ${sm.siteMeasureNumber ?? sm.id}${
            sm.location?.address ? ` · ${sm.location.address}` : ""
          }`,
          meta:
            rooms === undefined
              ? customer
              : `${customer} · ${rooms} ${rooms === 1 ? "room" : "rooms"}`,
        };
      }),
    [data]
  );

  async function onCreate() {
    if (selectedId === null) return;
    try {
      const estimate = await create.mutateAsync({ siteMeasureId: selectedId });
      onClose();
      router.push(`/estimates/${estimate.id}`);
    } catch {
      showToast("Failed to create estimate");
    }
  }

  return (
    <QuickCreatePanel
      open
      onClose={onClose}
      title="New estimate"
      hint="Search for a customer to see sites you've measured"
      placeholder="Search customers…"
      query={query}
      onQueryChange={(v) => {
        setQuery(v);
        setSelectedId(null);
      }}
      rows={rows}
      loading={isFetching}
      selectedId={selectedId}
      onSelect={setSelectedId}
      footerNote={
        selectedId === null
          ? "Select a site measure to continue"
          : "Site measure selected"
      }
      createLabel="Create estimate"
      onCreate={onCreate}
      createDisabled={selectedId === null || create.isPending}
      creating={create.isPending}
    />
  );
}
