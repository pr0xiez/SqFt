"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";

export interface InvoicePayment {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  recordedByName: string | null;
}

export interface InvoiceEvent {
  id: number;
  type: string;
  source: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface InvoiceLine {
  name: string;
  description: string | null;
  amount: number;
}

export interface InvoiceListItem {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  memo: string | null;
  dueDate: string | null;
  payments: Array<{ amount: number }>;
}

export interface InvoiceDetail {
  id: number;
  estimateId: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  pct: number | null;
  memo: string | null;
  terms: string;
  coverNote: string;
  paymentInstructions: string;
  date: string;
  dueDate: string | null;
  publicToken: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  snapshot: { lines?: InvoiceLine[] } | null;
  payments: InvoicePayment[];
  invoiceEvents: InvoiceEvent[];
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const { message } = await readApiError(res, fallback);
    throw new Error(message);
  }
  return res.json();
}

export function useInvoices(estimateId: number) {
  return useQuery({
    queryKey: ["invoices", "estimate", estimateId],
    queryFn: async () =>
      jsonOrThrow<InvoiceListItem[]>(
        await fetch(`/api/estimates/${estimateId}/invoices`),
        "Failed to load invoices"
      ),
    enabled: !!estimateId,
  });
}

export function useInvoice(id: number) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: async () =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/invoices/${id}`),
        "Failed to load invoice"
      ),
    enabled: !!id,
  });
}

export interface CreateInvoiceVariables {
  amount: number;
  memo?: string;
  dueDate?: string;
  coverNote?: string;
  terms?: string;
}

export function useCreateInvoice(estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateInvoiceVariables): Promise<InvoiceDetail> =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/estimates/${estimateId}/invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
        "Failed to create invoice"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates", estimateId] });
    },
  });
}

export interface SendInvoiceVariables {
  to: string;
  subject: string;
}

export function useSendInvoice(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SendInvoiceVariables): Promise<{ ok: true }> =>
      jsonOrThrow<{ ok: true }>(
        await fetch(`/api/invoices/${id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
        "Send failed"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
    },
  });
}

export interface RecordPaymentVariables {
  amount: number;
  method: string;
  paidAt?: string;
  reference?: string;
  note?: string;
}

export function useRecordPayment(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: RecordPaymentVariables): Promise<InvoiceDetail> =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/invoices/${id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
        "Failed to record payment"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
    },
  });
}

export function useVoidInvoice(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<InvoiceDetail> =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/invoices/${id}/void`, { method: "POST" }),
        "Failed to void invoice"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
    },
  });
}
