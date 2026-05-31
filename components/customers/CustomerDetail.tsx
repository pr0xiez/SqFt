"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerHeader } from "@/components/customers/CustomerHeader";
import { CustomerInfoCard } from "@/components/customers/CustomerInfoCard";
import { CustomerPipeline } from "@/components/customers/CustomerPipeline";
import { CustomerStatStrip } from "@/components/customers/CustomerStatStrip";
import { LocationsCard } from "@/components/customers/LocationsCard";
import { useToast } from "@/components/ui/Toast";
import { isOpenEstimate, lastTouchAt } from "@/lib/estimateStatus";
import {
  type CustomerEstimateSummary,
  type CustomerLocationSummary,
  type CustomerSiteMeasureSummary,
  useCustomer,
  useUpdateCustomer,
} from "@/lib/hooks/useCustomers";
import { useCreateLocation } from "@/lib/hooks/useLocations";
import { useCreateSiteMeasure } from "@/lib/hooks/useSiteMeasures";

interface Props {
  customerId: number;
}

export function CustomerDetailView({ customerId }: Props) {
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer(customerId);
  const createSiteMeasure = useCreateSiteMeasure();
  const createLocation = useCreateLocation();
  const { showToast } = useToast();

  const [addingLocation, setAddingLocation] = useState(false);

  const locations: CustomerLocationSummary[] = useMemo(
    () => customer?.locations ?? [],
    [customer?.locations]
  );

  const siteMeasures: (CustomerSiteMeasureSummary & {
    locationId: number;
    locationAddress: string;
  })[] = useMemo(
    () =>
      locations.flatMap((loc) =>
        loc.siteMeasures.map((sm) => ({
          ...sm,
          locationId: loc.id,
          locationAddress: loc.address,
        }))
      ),
    [locations]
  );

  const stats = useMemo(() => {
    const allEstimates: CustomerEstimateSummary[] = siteMeasures.flatMap(
      (e) => e.estimates ?? []
    );
    const open = allEstimates.filter(isOpenEstimate).length;
    const accepted = allEstimates.filter((q) => q.status === "approved").length;
    const declined = allEstimates.filter((q) => q.status === "declined").length;
    const lastActivityIso = allEstimates.map(lastTouchAt).sort().reverse()[0];
    return {
      siteMeasureCount: siteMeasures.length,
      estimateCount: allEstimates.length,
      open,
      accepted,
      declined,
      lastActivity: lastActivityIso ?? customer?.createdAt ?? null,
    };
  }, [siteMeasures, customer?.createdAt]);

  async function handleField(field: string, value: string) {
    try {
      await updateCustomer.mutateAsync({ [field]: value });
    } catch {
      showToast("Failed to save");
    }
  }

  async function handleNewSiteMeasure(locationId: number) {
    try {
      const est = await createSiteMeasure.mutateAsync({ locationId });
      router.push(`/site-measures/${est.id}`);
    } catch {
      showToast("Failed to create site measure");
    }
  }

  // Start a site measure: use the only location if there's one, otherwise
  // surface the locations list so the user picks where it was measured.
  function startSiteMeasure() {
    if (locations.length === 1) {
      void handleNewSiteMeasure(locations[0].id);
      return;
    }
    if (locations.length === 0) {
      setAddingLocation(true);
      showToast("Add a location first");
      return;
    }
    document
      .getElementById("locations-card")
      ?.scrollIntoView({ behavior: "smooth" });
    showToast("Pick a location below to start");
  }

  async function handleAddLocation(address: string, label: string) {
    if (!address) {
      showToast("Address required");
      throw new Error("address required");
    }
    try {
      await createLocation.mutateAsync({
        customerId,
        address,
        label: label || undefined,
      });
    } catch {
      showToast("Failed to add location");
      throw new Error("create failed");
    }
  }

  if (isLoading) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-8">
        Loading…
      </p>
    );
  }

  if (!customer) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] py-8">
        Customer not found.
      </p>
    );
  }

  return (
    <>
      <CustomerHeader
        customer={customer}
        locations={locations}
        onBack={() => router.push("/customers")}
      />

      <CustomerStatStrip stats={stats} />

      <CustomerInfoCard customer={customer} onField={handleField} />

      <LocationsCard
        locations={locations}
        adding={addingLocation}
        onAddingChange={setAddingLocation}
        onAddLocation={handleAddLocation}
        onStartSiteMeasure={handleNewSiteMeasure}
        isAdding={createLocation.isPending}
        isStarting={createSiteMeasure.isPending}
      />

      <CustomerPipeline
        siteMeasures={siteMeasures}
        openCount={stats.open}
        onStartSiteMeasure={startSiteMeasure}
        onOpenSiteMeasure={(id) => router.push(`/site-measures/${id}`)}
        onOpenEstimate={(qid) => router.push(`/estimates/${qid}`)}
        isStarting={createSiteMeasure.isPending}
      />
    </>
  );
}
