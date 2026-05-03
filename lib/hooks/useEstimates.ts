"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LineItemCalc, RoomItem } from "@/lib/utils";

export interface Estimate {
  id: number;
  orgId: string;
  customerId: number;
  status: string;
  date: string;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  createdAt: string;
  customer?: { id: number; name: string; address?: string | null };
  items?: RoomItem[];
  lineItems?: LineItemCalc[];
  _count?: { items: number };
}

export interface CreateEstimateInput {
  customerId: number;
  taxRate?: number;
  markupPct?: number;
  depositPct?: number;
}

export interface UpdateEstimateInput {
  status?: string;
  taxRate?: number;
  markupPct?: number;
  depositPct?: number;
  items?: RoomItem[];
  lineItems?: LineItemCalc[];
}

async function fetchEstimates(): Promise<Estimate[]> {
  const res = await fetch("/api/estimates");
  if (!res.ok) throw new Error("Failed to fetch estimates");
  return res.json();
}

async function fetchEstimate(id: number): Promise<Estimate> {
  const res = await fetch(`/api/estimates/${id}`);
  if (!res.ok) throw new Error("Failed to fetch estimate");
  return res.json();
}

export function useEstimates() {
  return useQuery({
    queryKey: ["estimates"],
    queryFn: fetchEstimates,
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
    mutationFn: async (input: CreateEstimateInput) => {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create estimate");
      return res.json() as Promise<Estimate>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
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

export function useDeleteEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/estimates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
  });
}
