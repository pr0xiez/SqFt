"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface LineItemTemplate {
  id: number;
  orgId: string;
  name: string;
  description: string | null;
  rate: number;
  unitLabel: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CreateLineItemTemplateInput {
  name: string;
  description?: string | null;
  rate?: number;
  unitLabel?: string;
}

export interface UpdateLineItemTemplateInput {
  name?: string;
  description?: string | null;
  rate?: number;
  unitLabel?: string;
  archived?: boolean;
  sortOrder?: number;
}

async function fetchTemplates(
  includeArchived: boolean
): Promise<LineItemTemplate[]> {
  const url = includeArchived
    ? "/api/line-item-templates?includeArchived=1"
    : "/api/line-item-templates";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch line item templates");
  return res.json();
}

export function useLineItemTemplates(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: ["line-item-templates", { includeArchived }],
    queryFn: () => fetchTemplates(includeArchived),
  });
}

export function useCreateLineItemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLineItemTemplateInput) => {
      const res = await fetch("/api/line-item-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json() as Promise<LineItemTemplate>;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["line-item-templates"] }),
  });
}

export function useUpdateLineItemTemplate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateLineItemTemplateInput) => {
      const res = await fetch(`/api/line-item-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json() as Promise<LineItemTemplate>;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["line-item-templates"] }),
  });
}

export function useDeleteLineItemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/line-item-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["line-item-templates"] }),
  });
}
