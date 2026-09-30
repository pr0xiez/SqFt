"use client";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { SCHEDULABLE_ESTIMATES_KEY } from "@/lib/hooks/useSchedulableEstimates";

/** Event mutations also move estimates in/out of the unscheduled backlog. */
function invalidateEventQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["events"] });
  qc.invalidateQueries({ queryKey: SCHEDULABLE_ESTIMATES_KEY });
}

export interface AssigneeSummary {
  id: string;
  name: string;
  title?: string | null;
}

export interface CalEvent {
  id: number;
  orgId: string;
  type: "job" | "visit" | "other";
  title: string;
  customerId?: number | null;
  estimateId?: number | null;
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  assignees: AssigneeSummary[];
  notes?: string | null;
  createdAt: string;
  customer?: { id: number; name: string; phone?: string | null } | null;
  estimateNumber?: number | null;
  address?: string | null;
}

export interface CreateEventInput {
  type: "job" | "visit" | "other";
  title: string;
  customerId?: number;
  estimateId?: number;
  date: string;
  /** null (updates only) clears a multi-day event back to single-day. */
  endDate?: string | null;
  startTime: string;
  endTime: string;
  assigneeIds?: string[];
  notes?: string;
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: () =>
      apiFetch<CalEvent[]>("/api/events", undefined, "Failed to fetch events"),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) =>
      apiFetch<CalEvent>(
        "/api/events",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create event"
      ),
    onSuccess: () => invalidateEventQueries(qc),
  });
}

export function useUpdateEvent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateEventInput>) =>
      apiFetch<void>(
        `/api/events/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Failed to update event"
      ),
    onSuccess: () => invalidateEventQueries(qc),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(
        `/api/events/${id}`,
        { method: "DELETE" },
        "Failed to delete event"
      ),
    onSettled: () => invalidateEventQueries(qc),
  });
}
