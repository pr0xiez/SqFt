"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";
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
}

export interface UpdateSiteMeasureInput {
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

export function useSiteMeasures(params: SiteMeasureListParams) {
  return useQuery({
    queryKey: keys.siteMeasures.list(params),
    queryFn: () =>
      apiFetch<SiteMeasureListResponse>(
        `/api/site-measures?${siteMeasuresQueryString(params)}`,
        undefined,
        "Failed to fetch siteMeasures"
      ),
    placeholderData: keepPreviousData,
  });
}

export function useSiteMeasure(id: number) {
  return useQuery({
    queryKey: keys.siteMeasures.detail(id),
    queryFn: () =>
      apiFetch<SiteMeasure>(
        `/api/site-measures/${id}`,
        undefined,
        "Failed to fetch siteMeasure"
      ),
    enabled: !!id,
  });
}

export function useCreateSiteMeasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSiteMeasureInput) =>
      apiFetch<SiteMeasure>(
        "/api/site-measures",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create siteMeasure"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.siteMeasures.all });
      qc.invalidateQueries({ queryKey: keys.customers.all });
    },
  });
}

export function useUpdateSiteMeasure(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSiteMeasureInput) =>
      apiFetch<SiteMeasure>(
        `/api/site-measures/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Failed to save siteMeasure"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.siteMeasures.all });
      qc.invalidateQueries({ queryKey: keys.siteMeasures.detail(id) });
      qc.invalidateQueries({ queryKey: keys.customers.all });
    },
  });
}

export function useDeleteSiteMeasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(
        `/api/site-measures/${id}`,
        { method: "DELETE" },
        "Failed to delete site measure"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.siteMeasures.all });
      qc.invalidateQueries({ queryKey: keys.customers.all });
    },
  });
}
