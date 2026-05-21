"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import type { LineItemCalc, RoomItem } from "@/lib/utils";

export interface QuoteEstimateSummary {
  id: number;
  estimateNumber?: number | null;
  title: string;
  customer?: { id: number; name: string; address?: string | null };
}

export interface QuoteListItem {
  id: number;
  orgId: string;
  estimateId: number;
  quoteNumber: number;
  status: string;
  date: string;
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  createdAt: string;
  estimate: QuoteEstimateSummary;
  _count: { lineItems: number };
  total: number | null;
  revisedFromId: number | null;
}

export interface QuoteDeclineEvent {
  id: number;
  type: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface QuoteDetail {
  id: number;
  orgId: string;
  estimateId: number;
  quoteNumber: number;
  status: string;
  date: string;
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  approvalToken?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
  createdAt: string;
  estimate: {
    id: number;
    estimateNumber?: number | null;
    title: string;
    customer?: {
      id: number;
      name: string;
      address?: string | null;
      email?: string | null;
    };
    items: RoomItem[];
  };
  lineItems: LineItemCalc[];
  org?: { name: string } | null;
  signature?: { signedByName: string } | null;
  quoteEvents?: QuoteDeclineEvent[];
  revisedFrom?: { id: number; quoteNumber: number } | null;
  revisedBy?: { id: number; quoteNumber: number }[];
}

export interface UpdateQuoteInput {
  status?: "draft" | "sent" | "accepted" | "declined";
  convenienceFeeRate?: number;
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemCalc[];
}

async function fetchQuotes(): Promise<QuoteListItem[]> {
  const res = await fetch("/api/quotes");
  if (!res.ok) throw new Error("Failed to fetch quotes");
  return res.json();
}

async function fetchQuote(id: number): Promise<QuoteDetail> {
  const res = await fetch(`/api/quotes/${id}`);
  if (!res.ok) throw new Error("Failed to fetch quote");
  return res.json();
}

export function useQuotes() {
  return useQuery({ queryKey: ["quotes"], queryFn: fetchQuotes });
}

export function useQuote(id: number) {
  return useQuery({
    queryKey: ["quotes", id],
    queryFn: () => fetchQuote(id),
    enabled: !!id,
  });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { estimateId: number }): Promise<QuoteDetail> => {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create quote");
      return res.json();
    },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["estimates", q.estimateId] });
    },
  });
}

export function useUpdateQuote(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateQuoteInput) => {
      const res = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save quote");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", id] });
    },
  });
}

export function useRotateQuoteToken(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ approvalToken: string }> => {
      const res = await fetch(`/api/quotes/${id}/approval-token`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate approval token");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", id] }),
  });
}

export interface SendQuoteVariables {
  to: string;
  subject: string;
  message?: string;
  regenerateLink?: boolean;
}

export function useSendQuote(quoteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SendQuoteVariables): Promise<{ ok: true }> => {
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
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
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", quoteId] });
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      id: number
    ): Promise<{ ok?: boolean; error?: string }> => {
      const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const { message } = await readApiError(
          res,
          "Quote has scheduled events"
        );
        throw new Error(message);
      }
      if (!res.ok) throw new Error("Failed to delete quote");
      if (res.status === 204) return { ok: true };
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}
