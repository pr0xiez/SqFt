"use client";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

async function fetchEvents(): Promise<CalEvent[]> {
  const res = await fetch("/api/events");
  if (!res.ok) throw new Error("Failed to fetch events");
  return res.json();
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create event");
      return res.json() as Promise<CalEvent>;
    },
    onSuccess: () => invalidateEventQueries(qc),
  });
}

export function useUpdateEvent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CreateEventInput>) => {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update event");
    },
    onSuccess: () => invalidateEventQueries(qc),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => invalidateEventQueries(qc),
  });
}
