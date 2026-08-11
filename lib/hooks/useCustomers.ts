"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import type { EstimateStatus } from "@/lib/estimateStatus";
import type { SortDirection } from "@/lib/sort";

export interface CustomerEstimateSummary {
  id: number;
  estimateNumber: number;
  status: EstimateStatus;
  date: string;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  _count: { lineItems: number };
}

export interface CustomerListEstimateSummary {
  status: EstimateStatus;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

export interface CustomerSiteMeasureSummary {
  id: number;
  siteMeasureNumber: number | null;
  date: string;
  createdAt: string;
  estimates: CustomerEstimateSummary[];
}

export interface CustomerLocationSummary {
  id: number;
  address: string;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  label: string | null;
  notes: string | null;
  createdAt: string;
  siteMeasures: CustomerSiteMeasureSummary[];
}

/**
 * Base customer record — the bare row shape, no relations.
 * Returned by POST /api/customers and PATCH /api/customers/:id, and
 * accepted by consumers that only need contact info (e.g. the customer
 * picker).
 */
export interface Customer {
  id: number;
  orgId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  source: string;
  notes?: string | null;
  createdAt: string;
}

/**
 * Shape returned by GET /api/customers — each siteMeasure carries only a
 * slim estimate summary used to derive pipeline state on the list view.
 */
export interface CustomerListItem extends Customer {
  _count?: { locations: number };
  locations?: {
    siteMeasures: { estimates: CustomerListEstimateSummary[] }[];
  }[];
}

/**
 * Shape returned by GET /api/customers/:id — locations, each with their
 * siteMeasure + estimate details, for the customer detail page.
 */
export interface CustomerDetail extends Customer {
  _count?: { locations: number };
  locations?: CustomerLocationSummary[];
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  notes?: string;
}

export interface CustomerListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  source: string;
  pipeline: string;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  facets: Record<string, number>;
  summary: { openEstimates: number; won: number; withOpen: number };
}

function customersQueryString(p: CustomerListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.source && p.source !== "all") sp.set("source", p.source);
  if (p.pipeline && p.pipeline !== "any") sp.set("pipeline", p.pipeline);
  return sp.toString();
}

async function fetchCustomers(
  p: CustomerListParams
): Promise<CustomerListResponse> {
  const res = await fetch(`/api/customers?${customersQueryString(p)}`);
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json();
}

async function fetchCustomer(id: number): Promise<CustomerDetail> {
  const res = await fetch(`/api/customers/${id}`);
  if (!res.ok) throw new Error("Failed to fetch customer");
  return res.json();
}

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () => fetchCustomers(params),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => fetchCustomer(id),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCustomerInput) => {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create customer");
      return res.json() as Promise<Customer>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CreateCustomerInput>) => {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update customer");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers", id] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const { message } = await readApiError(
          res,
          "Failed to delete customer"
        );
        throw new Error(message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
