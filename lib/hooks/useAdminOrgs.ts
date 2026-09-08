"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminOrgRow,
  CreateAdminOrgInput,
  CreateAdminOrgResult,
} from "@/components/admin/orgs/types";
import { apiFetch } from "@/lib/hooks/apiFetch";

const ADMIN_ORGS_KEY = ["admin", "orgs"] as const;

export function useListAdminOrgs(initial: AdminOrgRow[]) {
  return useQuery({
    queryKey: ADMIN_ORGS_KEY,
    initialData: initial,
    queryFn: () =>
      apiFetch<AdminOrgRow[]>(
        "/api/admin/orgs",
        undefined,
        "Failed to load orgs"
      ),
  });
}

export function useCreateAdminOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminOrgInput) =>
      apiFetch<CreateAdminOrgResult>(
        "/api/admin/orgs",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create organization"
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_ORGS_KEY }),
  });
}
