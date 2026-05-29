"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RoomItem } from "@/lib/utils";

export interface SiteMeasureEstimateSummary {
  id: number;
  estimateNumber: number;
  status: string;
  date: string;
  createdAt: string;
  _count: { lineItems: number };
}

export interface SiteMeasureLocationSummary {
  id: number;
  address: string;
  label?: string | null;
  customer?: { id: number; name: string } | null;
}

export interface SiteMeasure {
  id: number;
  orgId: string;
  locationId: number;
  title: string;
  siteMeasureNumber?: number | null;
  date: string;
  createdAt: string;
  location?: SiteMeasureLocationSummary | null;
  items?: RoomItem[];
  estimates?: SiteMeasureEstimateSummary[];
  _count?: { items: number; estimates: number };
}

export interface CreateSiteMeasureInput {
  locationId: number;
  title?: string;
}

export interface UpdateSiteMeasureInput {
  title?: string;
  locationId?: number;
  items?: RoomItem[];
}

async function fetchSiteMeasures(): Promise<SiteMeasure[]> {
  const res = await fetch("/api/site-measures");
  if (!res.ok) throw new Error("Failed to fetch siteMeasures");
  return res.json();
}

async function fetchSiteMeasure(id: number): Promise<SiteMeasure> {
  const res = await fetch(`/api/site-measures/${id}`);
  if (!res.ok) throw new Error("Failed to fetch siteMeasure");
  return res.json();
}

export function useSiteMeasures() {
  return useQuery({ queryKey: ["siteMeasures"], queryFn: fetchSiteMeasures });
}

export function useSiteMeasure(id: number) {
  return useQuery({
    queryKey: ["siteMeasures", id],
    queryFn: () => fetchSiteMeasure(id),
    enabled: !!id,
  });
}

export function useCreateSiteMeasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSiteMeasureInput) => {
      const res = await fetch("/api/site-measures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create siteMeasure");
      return res.json() as Promise<SiteMeasure>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["siteMeasures"] }),
  });
}

export function useUpdateSiteMeasure(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateSiteMeasureInput) => {
      const res = await fetch(`/api/site-measures/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save siteMeasure");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["siteMeasures"] });
      qc.invalidateQueries({ queryKey: ["siteMeasures", id] });
    },
  });
}

export function useDeleteSiteMeasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/site-measures/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["siteMeasures"] }),
  });
}
