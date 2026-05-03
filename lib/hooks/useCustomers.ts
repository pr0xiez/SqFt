"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CustomerEstimateSummary {
  id: number;
  date: string;
  status: string;
}

export interface Customer {
  id: number;
  orgId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  source: string;
  notes?: string | null;
  createdAt: string;
  estimates?: CustomerEstimateSummary[];
  _count?: { estimates: number };
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  source?: string;
  notes?: string;
}

async function fetchCustomers(): Promise<Customer[]> {
  const res = await fetch("/api/customers");
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json();
}

async function fetchCustomer(id: number): Promise<Customer> {
  const res = await fetch(`/api/customers/${id}`);
  if (!res.ok) throw new Error("Failed to fetch customer");
  return res.json();
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
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
      await fetch(`/api/customers/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
