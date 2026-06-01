"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { SortDirection } from "@/lib/sort";
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

export interface SiteMeasureListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  status: string;
}

export interface SiteMeasureListResponse {
  items: SiteMeasure[];
  total: number;
  facets: Record<string, number>;
}

function siteMeasuresQueryString(p: SiteMeasureListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.status && p.status !== "all") sp.set("status", p.status);
  return sp.toString();
}

async function fetchSiteMeasures(
  p: SiteMeasureListParams
): Promise<SiteMeasureListResponse> {
  const res = await fetch(`/api/site-measures?${siteMeasuresQueryString(p)}`);
  if (!res.ok) throw new Error("Failed to fetch siteMeasures");
  return res.json();
}

async function fetchSiteMeasure(id: number): Promise<SiteMeasure> {
  const res = await fetch(`/api/site-measures/${id}`);
  if (!res.ok) throw new Error("Failed to fetch siteMeasure");
  return res.json();
}

export function useSiteMeasures(params: SiteMeasureListParams) {
  return useQuery({
    queryKey: ["siteMeasures", params],
    queryFn: () => fetchSiteMeasures(params),
    placeholderData: keepPreviousData,
  });
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
