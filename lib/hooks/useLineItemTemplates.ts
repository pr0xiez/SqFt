"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";

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

export function useLineItemTemplates(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: ["line-item-templates", { includeArchived }],
    queryFn: () =>
      apiFetch<LineItemTemplate[]>(
        includeArchived
          ? "/api/line-item-templates?includeArchived=1"
          : "/api/line-item-templates",
        undefined,
        "Failed to fetch line item templates"
      ),
  });
}

export function useCreateLineItemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLineItemTemplateInput) =>
      apiFetch<LineItemTemplate>(
        "/api/line-item-templates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create template"
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["line-item-templates"] }),
  });
}

export function useUpdateLineItemTemplate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateLineItemTemplateInput) =>
      apiFetch<LineItemTemplate>(
        `/api/line-item-templates/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Failed to update template"
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["line-item-templates"] }),
  });
}

export function useDeleteLineItemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(
        `/api/line-item-templates/${id}`,
        { method: "DELETE" },
        "Failed to delete template"
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["line-item-templates"] }),
  });
}
