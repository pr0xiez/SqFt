"use client";

import { useQuery } from "@tanstack/react-query";
import type { SchedulableCandidate } from "@/lib/schedule/backlog";

/**
 * Query key for the unscheduled-jobs backlog. Event mutations invalidate it
 * (see useEvents) so scheduling a job removes it from the backlog immediately.
 */
export const SCHEDULABLE_ESTIMATES_KEY = ["estimates", "schedulable"] as const;

async function fetchSchedulableEstimates(): Promise<SchedulableCandidate[]> {
  const res = await fetch("/api/estimates/schedulable");
  if (!res.ok) throw new Error("Failed to fetch schedulable estimates");
  return res.json();
}

export function useSchedulableEstimates() {
  return useQuery({
    queryKey: SCHEDULABLE_ESTIMATES_KEY,
    queryFn: fetchSchedulableEstimates,
  });
}
