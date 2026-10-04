"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerContactCard } from "@/components/customers/CustomerContactCard";
import { CustomerHeader } from "@/components/customers/CustomerHeader";
import { CustomerInvoicesCard } from "@/components/customers/CustomerInvoicesCard";
import { CustomerPipeline } from "@/components/customers/CustomerPipeline";
import { CustomerStatStrip } from "@/components/customers/CustomerStatStrip";
import { CustomerTimeline } from "@/components/customers/CustomerTimeline";
import { CustomerUpcomingCard } from "@/components/customers/CustomerUpcomingCard";
import {
  LocationsCard,
  type NewLocationInput,
} from "@/components/customers/LocationsCard";
import type { EventFormDefaults } from "@/components/schedule/EventFormPanel";
import { ScheduleEventPanel } from "@/components/schedule/ScheduleEventPanel";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingLine } from "@/components/ui/EmptyState";
import {
  CalendarPlusIcon,
  CaretRightIcon,
  MapPinIcon,
  RulerIcon,
} from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  buildCustomerTimeline,
  summarizeCustomerActivity,
  upcomingEvents,
} from "@/lib/customers/activity";
import { isOpenEstimate, lastTouchAt } from "@/lib/estimateStatus";
import { useCustomerActivity } from "@/lib/hooks/useCustomerActivity";
import {
  type CustomerEstimateSummary,
  type CustomerLocationSummary,
  type CustomerSiteMeasureSummary,
  useCustomer,
  useUpdateCustomer,
} from "@/lib/hooks/useCustomers";
import { useCreateLocation } from "@/lib/hooks/useLocations";
import { useCreateSiteMeasure } from "@/lib/hooks/useSiteMeasures";
import { todayStr } from "@/lib/utils";

interface Props {
  customerId: number;
}

/**
 * The customer hub: who they are and how to reach them, every job in flight
 * (site measures and estimates), what they owe, what's booked, and a timeline
 * of everything that has happened, with the next actions in the header.
 */
export function CustomerDetailView({ customerId }: Props) {
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(customerId);
  const { data: activity, isLoading: activityLoading } =
    useCustomerActivity(customerId);
  const updateCustomer = useUpdateCustomer(customerId);
  const createSiteMeasure = useCreateSiteMeasure();
  const createLocation = useCreateLocation();
  const { showToast } = useToast();

  const [addingLocation, setAddingLocation] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [visitDefaults, setVisitDefaults] = useState<EventFormDefaults | null>(
    null
  );
  const [today] = useState(todayStr);

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

  const estimates: CustomerEstimateSummary[] = useMemo(
    () => siteMeasures.flatMap((sm) => sm.estimates ?? []),
    [siteMeasures]
  );

  // Estimate figures come with the customer; the balance needs the activity
  // feed's invoices.
  const summary = useMemo(
    () =>
      summarizeCustomerActivity({
        estimates,
        invoices: activity?.invoices ?? [],
      }),
    [estimates, activity?.invoices]
  );
  const timeline = useMemo(
    () => (activity ? buildCustomerTimeline(activity, today) : undefined),
    [activity, today]
  );
  const upcoming = useMemo(
    () => (activity ? upcomingEvents(activity.events, today) : undefined),
    [activity, today]
  );
  const lastActivity =
    timeline?.[0]?.at ??
    estimates.map(lastTouchAt).sort().reverse()[0] ??
    customer?.createdAt ??
    null;

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

  // Start a site measure: use the only location if there's one, ask which
  // when there are several, and open the add-location form when there's none.
  function startSiteMeasure() {
    if (locations.length === 1) {
      void handleNewSiteMeasure(locations[0].id);
      return;
    }
    if (locations.length === 0) {
      setAddingLocation(true);
      showToast("Add a location first");
      document
        .getElementById("locations-card")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPickingLocation(true);
  }

  function scheduleVisit() {
    if (!customer) return;
    setVisitDefaults({
      type: "visit",
      title: `Visit: ${customer.name}`,
      customerId,
    });
  }

  async function handleAddLocation(input: NewLocationInput) {
    if (!input.street || !input.city || !input.state || !input.postalCode) {
      showToast("Address required");
      throw new Error("address required");
    }
    try {
      await createLocation.mutateAsync({
        customerId,
        street: input.street,
        unit: input.unit || undefined,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        lat: input.lat,
        lon: input.lon,
        label: input.label || undefined,
      });
    } catch {
      showToast("Failed to add location");
      throw new Error("create failed");
    }
  }

  if (isLoading) {
    return <LoadingLine className="py-8" />;
  }

  if (!customer) {
    return <ErrorState className="px-0 py-8" message="Customer not found." />;
  }

  return (
    <>
      <CustomerHeader
        customer={customer}
        locations={locations}
        actions={
          <>
            <Button onClick={scheduleVisit}>
              <CalendarPlusIcon aria-hidden="true" />
              Schedule visit
            </Button>
            <Button
              variant="primary"
              onClick={startSiteMeasure}
              disabled={createSiteMeasure.isPending}
            >
              <RulerIcon aria-hidden="true" />
              New site measure
            </Button>
          </>
        }
      />

      <CustomerStatStrip
        summary={summary}
        moneyReady={activity !== undefined}
        lastActivity={lastActivity}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <CustomerPipeline
            siteMeasures={siteMeasures}
            openCount={estimates.filter(isOpenEstimate).length}
            onStartSiteMeasure={startSiteMeasure}
            onOpenSiteMeasure={(id) => router.push(`/site-measures/${id}`)}
            onOpenEstimate={(qid) => router.push(`/estimates/${qid}`)}
            isStarting={createSiteMeasure.isPending}
          />
          <CustomerInvoicesCard
            invoices={activity?.invoices}
            loading={activityLoading}
          />
          <CustomerTimeline entries={timeline} loading={activityLoading} />
        </div>

        <aside className="flex flex-col gap-6 min-w-0">
          <CustomerUpcomingCard events={upcoming} loading={activityLoading} />
          <CustomerContactCard customer={customer} onField={handleField} />
          <LocationsCard
            locations={locations}
            adding={addingLocation}
            onAddingChange={setAddingLocation}
            onAddLocation={handleAddLocation}
            onStartSiteMeasure={handleNewSiteMeasure}
            isAdding={createLocation.isPending}
            isStarting={createSiteMeasure.isPending}
          />
        </aside>
      </div>

      <Modal
        open={pickingLocation}
        onClose={() => setPickingLocation(false)}
        title="Which location?"
        sub="Pick where you're measuring."
        maxWidth="440px"
      >
        <ul className="-mx-2">
          {locations.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                disabled={createSiteMeasure.isPending}
                onClick={() => {
                  setPickingLocation(false);
                  void handleNewSiteMeasure(loc.id);
                }}
                className="w-full flex items-center gap-3 text-left px-2 py-2.5 min-h-[52px] rounded-[var(--r)] cursor-pointer hover:bg-[var(--hover)] disabled:opacity-50"
              >
                <MapPinIcon
                  aria-hidden="true"
                  className="size-[18px] shrink-0 text-[var(--muted)]"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-[600] tracking-[-0.01em]">
                    {loc.address}
                  </span>
                  <span className="block text-[13px] text-[var(--muted)]">
                    {loc.label ? `${loc.label}, ` : ""}
                    {loc.siteMeasures.length} site measure
                    {loc.siteMeasures.length === 1 ? "" : "s"}
                  </span>
                </span>
                <CaretRightIcon
                  aria-hidden="true"
                  className="size-4 text-[var(--muted)]"
                />
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <ScheduleEventPanel
        open={visitDefaults !== null}
        onClose={() => setVisitDefaults(null)}
        defaults={visitDefaults}
        customer={{ id: customer.id, name: customer.name }}
      />
    </>
  );
}
