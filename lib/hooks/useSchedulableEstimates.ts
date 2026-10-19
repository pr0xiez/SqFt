"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";
import type { SchedulableCandidate } from "@/lib/schedule/backlog";

/**
 * Query key for the unscheduled-jobs backlog. Event mutations invalidate it
 * (see useEvents) so scheduling a job removes it from the backlog immediately.
 */

export function useSchedulableEstimates() {
  return useQuery({
    queryKey: keys.estimates.schedulable,
    queryFn: () =>
      apiFetch<SchedulableCandidate[]>(
        "/api/estimates/schedulable",
        undefined,
        "Failed to fetch schedulable estimates"
      ),
  });
}
