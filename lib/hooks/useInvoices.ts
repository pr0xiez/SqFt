"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InvoiceStatusFilter } from "@/components/invoices/filterInvoices";
import { apiFetch } from "@/lib/hooks/apiFetch";
import type { InvoiceSnapshot } from "@/lib/invoices/types";
import type { InvoiceListRow as InvoiceListRowDb } from "@/lib/repositories/invoiceRepo";
import type { SortDirection } from "@/lib/sort";

export interface InvoicePayment {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  recordedByName: string | null;
  stripeFeeAmount: number | null;
  stripeNetAmount: number | null;
}

export interface InvoiceEvent {
  id: number;
  type: string;
  source: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
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

/**
 * Row in the org-wide invoices list. Same shape as the repo's `InvoiceListRow`,
 * but `Date` fields arrive over the wire as ISO strings (or null).
 */
export type InvoiceListRow = Omit<InvoiceListRowDb, "dueDate" | "sentAt"> & {
  dueDate: string | null;
  sentAt: string | null;
};

export interface InvoiceListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  status: InvoiceStatusFilter;
}

export interface InvoiceListResponse {
  items: InvoiceListRow[];
  total: number;
  facets: Record<string, number>;
}

/** Status is always sent explicitly, including the "all" default. */
function invoiceListQueryString(p: InvoiceListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  sp.set("status", p.status);
  if (p.q) sp.set("q", p.q);
  return sp.toString();
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
  /** The public review token is never sent to the client (CWE-201/522: it's
   *  a bearer credential for the unauthenticated invoice-review payment
   *  flow). Use `useInvoicePublicToken` to mint/read one when actually
   *  needed (the "copy public link" action). */
  hasPublicToken: boolean;
  sentAt: string | null;
  sentToEmail: string | null;
  customerEmail: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  snapshot: InvoiceSnapshot | null;
  payments: InvoicePayment[];
  invoiceEvents: InvoiceEvent[];
}

export function useInvoices(estimateId: number) {
  return useQuery({
    queryKey: ["invoices", "estimate", estimateId],
    queryFn: () =>
      apiFetch<InvoiceListItem[]>(
        `/api/estimates/${estimateId}/invoices`,
        undefined,
        "Failed to load invoices"
      ),
    enabled: !!estimateId,
  });
}

export function useInvoiceList(params: InvoiceListParams) {
  return useQuery({
    queryKey: ["invoices", "list", params],
    queryFn: () =>
      apiFetch<InvoiceListResponse>(
        `/api/invoices?${invoiceListQueryString(params)}`,
        undefined,
        "Failed to load invoices"
      ),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: number) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: () =>
      apiFetch<InvoiceDetail>(
        `/api/invoices/${id}`,
        undefined,
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
    mutationFn: (vars: CreateInvoiceVariables) =>
      apiFetch<InvoiceDetail>(
        `/api/estimates/${estimateId}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        },
        "Failed to create invoice"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates", estimateId] });
      qc.invalidateQueries({ queryKey: ["invoices", "list"] });
    },
  });
}

/** Rotate (or mint, if none exists) the invoice's public review token — the
 *  one sanctioned way to read a live token value, since the invoice detail
 *  payload never carries it. Used by the "copy public link" action. */
export function useInvoicePublicToken(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ publicToken: string }> =>
      jsonOrThrow<{ publicToken: string }>(
        await fetch(`/api/invoices/${id}/public-token`, { method: "POST" }),
        "Failed to generate link"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
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
    mutationFn: (vars: SendInvoiceVariables) =>
      apiFetch<{ ok: true }>(
        `/api/invoices/${id}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        },
        "Send failed"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["invoices", "list"] });
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
    mutationFn: (vars: RecordPaymentVariables) =>
      apiFetch<InvoiceDetail>(
        `/api/invoices/${id}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        },
        "Failed to record payment"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["invoices", "list"] });
    },
  });
}

export function useVoidInvoice(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<InvoiceDetail>(
        `/api/invoices/${id}/void`,
        { method: "POST" },
        "Failed to void invoice"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["invoices", "list"] });
    },
  });
}
