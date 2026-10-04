"use client";

import { useMemo, useState } from "react";
import {
  type EstimateOption,
  type EventFormDefaults,
  EventFormPanel,
} from "@/components/schedule/EventFormPanel";
import { useToast } from "@/components/ui/Toast";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useCreateEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

interface ScheduleEventPanelProps {
  open: boolean;
  onClose: () => void;
  defaults?: EventFormDefaults | null;
  /** Records the form is pre-filled with. They're merged into the pickers,
   *  which only load the 100 most recent customers and estimates, so a
   *  pre-filled select never shows blank. */
  customer?: { id: number; name: string } | null;
  estimate?: { id: number; estimateNumber: number; customerId: number } | null;
}

/**
 * The schedule's new-event form, usable from anywhere: "Schedule job" on an
 * estimate, "Schedule visit" on a customer, "New event" in the quick-create
 * menu. Create-only; editing stays on the Schedule Manager grid. Mounts its
 * data only while open.
 */
export function ScheduleEventPanel(props: ScheduleEventPanelProps) {
  if (!props.open) return null;
  return <OpenScheduleEventPanel {...props} />;
}

function OpenScheduleEventPanel({
  onClose,
  defaults,
  customer,
  estimate,
}: ScheduleEventPanelProps) {
  const { showToast } = useToast();
  const createEvent = useCreateEvent();
  const [today] = useState(todayStr);

  // Same params as the Schedule Manager so the two share one cache entry.
  const { data: customersData } = useCustomers({
    page: 1,
    perPage: 100,
    sort: "name",
    dir: "asc",
    q: "",
    source: "all",
    pipeline: "any",
  });
  const { data: estimatesData } = useEstimates({
    page: 1,
    perPage: 100,
    sort: "date",
    dir: "desc",
    q: "",
    status: "all",
  });

  const customers = useMemo(() => {
    const opts: { id: number; name: string }[] = [
      ...(customersData?.items ?? []),
    ];
    if (customer && !opts.some((o) => o.id === customer.id)) {
      opts.push(customer);
    }
    return opts;
  }, [customersData, customer]);

  const estimates = useMemo(() => {
    const opts: EstimateOption[] = [...(estimatesData?.items ?? [])];
    if (estimate && !opts.some((o) => o.id === estimate.id)) {
      opts.push({
        id: estimate.id,
        estimateNumber: estimate.estimateNumber,
        siteMeasure: { location: { customer: { id: estimate.customerId } } },
      });
    }
    return opts;
  }, [estimatesData, estimate]);

  return (
    <EventFormPanel
      open
      onClose={onClose}
      defaultDate={today}
      defaults={defaults}
      editingEvent={null}
      customers={customers}
      estimates={estimates}
      onSave={async (data) => {
        try {
          await createEvent.mutateAsync(data);
          onClose();
          showToast("Event saved", data.title);
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : "Failed to save event"
          );
        }
      }}
      onDelete={async () => {}}
    />
  );
}
