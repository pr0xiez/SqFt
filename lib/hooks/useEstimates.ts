"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import type { SortDirection } from "@/lib/sort";
import type { LineItemCalc, RoomItem } from "@/lib/utils";

export interface EstimateSiteMeasureSummary {
  id: number;
  siteMeasureNumber?: number | null;
  title: string;
  location?: {
    id: number;
    address: string;
    customer?: { id: number; name: string } | null;
  } | null;
}

export interface EstimateListItem {
  id: number;
  orgId: string;
  siteMeasureId: number;
  estimateNumber: number;
  status: string;
  date: string;
  markupPct: number;
  depositPct: number;
  createdAt: string;
  siteMeasure: EstimateSiteMeasureSummary;
  _count: { lineItems: number };
  total: number | null;
  revisedFromId: number | null;
}

export interface EstimateDeclineEvent {
  id: number;
  type: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface EstimateDetail {
  id: number;
  orgId: string;
  siteMeasureId: number;
  estimateNumber: number;
  status: string;
  date: string;
  markupPct: number;
  depositPct: number;
  approvalToken?: string | null;
  approvedAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
  createdAt: string;
  siteMeasure: {
    id: number;
    siteMeasureNumber?: number | null;
    title: string;
    location?: {
      id: number;
      address: string;
      customer?: {
        id: number;
        name: string;
        email?: string | null;
      } | null;
    } | null;
    items: RoomItem[];
  };
  lineItems: LineItemCalc[];
  org?: { name: string; defaultDepositPct: number } | null;
  estimateEvents?: EstimateDeclineEvent[];
  revisedFrom?: { id: number; estimateNumber: number } | null;
  revisedBy?: { id: number; estimateNumber: number }[];
}

// "approved"/"declined" are not settable here — see CONTEXT.md "Estimate
// Approval" and the guard in lib/repositories/estimateRepo.ts saveEstimate.
export interface UpdateEstimateInput {
  status?: "draft" | "sent";
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemCalc[];
}

export interface EstimateListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  status: string;
}

export interface EstimateListResponse {
  items: EstimateListItem[];
  total: number;
  facets: Record<string, number>;
}

function estimatesQueryString(p: EstimateListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.status && p.status !== "all") sp.set("status", p.status);
  return sp.toString();
}

export function useEstimates(params: EstimateListParams) {
  return useQuery({
    queryKey: ["estimates", params],
    queryFn: () =>
      apiFetch<EstimateListResponse>(
        `/api/estimates?${estimatesQueryString(params)}`,
        undefined,
        "Failed to fetch estimates"
      ),
    placeholderData: keepPreviousData,
  });
}

export function useEstimate(id: number) {
  return useQuery({
    queryKey: ["estimates", id],
    queryFn: () =>
      apiFetch<EstimateDetail>(
        `/api/estimates/${id}`,
        undefined,
        "Failed to fetch estimate"
      ),
    enabled: !!id,
  });
}

export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { siteMeasureId: number }) =>
      apiFetch<EstimateDetail>(
        "/api/estimates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create estimate"
      ),
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["siteMeasures", q.siteMeasureId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateEstimate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateEstimateInput) =>
      apiFetch<EstimateDetail>(
        `/api/estimates/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Failed to save estimate"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimates", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export interface SendEstimateVariables {
  to: string;
  subject: string;
  message?: string;
  regenerateLink?: boolean;
}

export function useSendEstimate(estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SendEstimateVariables) =>
      apiFetch<{ ok: true }>(
        `/api/estimates/${estimateId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        },
        "Send failed"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimates", estimateId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useDeleteEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(
        `/api/estimates/${id}`,
        { method: "DELETE" },
        "Estimate has scheduled events"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
