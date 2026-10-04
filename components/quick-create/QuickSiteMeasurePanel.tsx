"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  QuickCreatePanel,
  type QuickRow,
} from "@/components/quick-create/QuickCreatePanel";
import { useToast } from "@/components/ui/Toast";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useLocationSearch } from "@/lib/hooks/useLocations";
import { useCreateSiteMeasure } from "@/lib/hooks/useSiteMeasures";

/**
 * Quick site measure: search a customer's locations and start measuring the
 * chosen one: the same create-and-open action the customer page's
 * Locations card exposes, lifted into the global launcher.
 */
export function QuickSiteMeasurePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const create = useCreateSiteMeasure();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const q = useDebouncedValue(query, 250);
  const { data, isFetching } = useLocationSearch(q);

  const rows = useMemo<QuickRow[]>(
    () =>
      (data ?? []).map((loc) => {
        const count = loc._count.siteMeasures;
        return {
          id: loc.id,
          title: loc.customer.name,
          meta: `${loc.address}${loc.label ? ` (${loc.label})` : ""} · ${count} site ${
            count === 1 ? "measure" : "measures"
          }`,
        };
      }),
    [data]
  );

  async function onCreate() {
    if (selectedId === null) return;
    try {
      const sm = await create.mutateAsync({ locationId: selectedId });
      onClose();
      router.push(`/site-measures/${sm.id}`);
    } catch {
      showToast("Failed to create site measure");
    }
  }

  return (
    <QuickCreatePanel
      open
      onClose={onClose}
      title="New site measure"
      hint="Pick the location you're measuring. New lead? Add them with New customer first."
      placeholder="Search customers or addresses…"
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
          ? "Select a location to continue"
          : "Location selected"
      }
      createLabel="Start measuring"
      onCreate={onCreate}
      createDisabled={selectedId === null || create.isPending}
      creating={create.isPending}
    />
  );
}
