"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
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
  convenienceFeeRate: number;
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
  convenienceFeeRate: number;
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

export interface UpdateEstimateInput {
  status?: "draft" | "sent" | "approved" | "declined";
  convenienceFeeRate?: number;
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

async function fetchEstimates(
  p: EstimateListParams
): Promise<EstimateListResponse> {
  const res = await fetch(`/api/estimates?${estimatesQueryString(p)}`);
  if (!res.ok) throw new Error("Failed to fetch estimates");
  return res.json();
}

async function fetchEstimate(id: number): Promise<EstimateDetail> {
  const res = await fetch(`/api/estimates/${id}`);
  if (!res.ok) throw new Error("Failed to fetch estimate");
  return res.json();
}

export function useEstimates(params: EstimateListParams) {
  return useQuery({
    queryKey: ["estimates", params],
    queryFn: () => fetchEstimates(params),
    placeholderData: keepPreviousData,
  });
}

export function useEstimate(id: number) {
  return useQuery({
    queryKey: ["estimates", id],
    queryFn: () => fetchEstimate(id),
    enabled: !!id,
  });
}

export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      siteMeasureId: number;
    }): Promise<EstimateDetail> => {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create estimate");
      return res.json();
    },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["siteMeasures", q.siteMeasureId] });
    },
  });
}

export function useUpdateEstimate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateEstimateInput) => {
      const res = await fetch(`/api/estimates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save estimate");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimates", id] });
    },
  });
}

export function useRotateEstimateToken(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ approvalToken: string }> => {
      const res = await fetch(`/api/estimates/${id}/approval-token`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate approval token");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates", id] }),
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
    mutationFn: async (vars: SendEstimateVariables): Promise<{ ok: true }> => {
      const res = await fetch(`/api/estimates/${estimateId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const { message } = await readApiError(
          res,
          `Send failed (${res.status})`
        );
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimates", estimateId] });
    },
  });
}

export function useDeleteEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      id: number
    ): Promise<{ ok?: boolean; error?: string }> => {
      const res = await fetch(`/api/estimates/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const { message } = await readApiError(
          res,
          "Estimate has scheduled events"
        );
        throw new Error(message);
      }
      if (!res.ok) throw new Error("Failed to delete estimate");
      if (res.status === 204) return { ok: true };
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
  });
}
