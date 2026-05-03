"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CalEvent {
  id: number;
  orgId: string;
  type: "job" | "visit" | "other";
  title: string;
  customerId?: number | null;
  estimateId?: number | null;
  date: string; // ISO date string
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  crew?: string | null;
  notes?: string | null;
  createdAt: string;
  customer?: { id: number; name: string } | null;
}

export interface CreateEventInput {
  type: "job" | "visit" | "other";
  title: string;
  customerId?: number;
  estimateId?: number;
  date: string;
  startTime: string;
  endTime: string;
  crew?: string;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/events/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
