"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { EstimateStatus } from "@/lib/estimateStatus";
import { apiFetch } from "@/lib/hooks/apiFetch";
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
  /** Cached estimate total; null when the estimate has no line items. */
  total: number | null;
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

/** The customer's first address, created as a Location alongside them. */
export interface CreateCustomerLocationInput {
  street: string;
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
  lat?: number;
  lon?: number;
  label?: string;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  notes?: string;
  location?: CreateCustomerLocationInput;
}

/** POST /api/customers response: the customer plus any location created. */
export interface CreatedCustomer extends Customer {
  locations: { id: number; address: string }[];
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

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () =>
      apiFetch<CustomerListResponse>(
        `/api/customers?${customersQueryString(params)}`,
        undefined,
        "Failed to fetch customers"
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () =>
      apiFetch<CustomerDetail>(
        `/api/customers/${id}`,
        undefined,
        "Failed to fetch customer"
      ),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      apiFetch<CreatedCustomer>(
        "/api/customers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create customer"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}

export function useUpdateCustomer(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Omit<CreateCustomerInput, "location">>) =>
      apiFetch<Customer>(
        `/api/customers/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Failed to update customer"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers", id] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(
        `/api/customers/${id}`,
        { method: "DELETE" },
        "Failed to delete customer"
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
