"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import type { SchedulableCandidate } from "@/lib/schedule/backlog";

/**
 * Query key for the unscheduled-jobs backlog. Event mutations invalidate it
 * (see useEvents) so scheduling a job removes it from the backlog immediately.
 */
export const SCHEDULABLE_ESTIMATES_KEY = ["estimates", "schedulable"] as const;

export function useSchedulableEstimates() {
  return useQuery({
    queryKey: SCHEDULABLE_ESTIMATES_KEY,
    queryFn: () =>
      apiFetch<SchedulableCandidate[]>(
        "/api/estimates/schedulable",
        undefined,
        "Failed to fetch schedulable estimates"
      ),
  });
}
