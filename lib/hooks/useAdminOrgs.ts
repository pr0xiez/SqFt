"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminOrgRow,
  CreateAdminOrgInput,
  CreateAdminOrgResult,
} from "@/components/admin/orgs/types";
import { readApiError } from "@/lib/api/errors";

const ADMIN_ORGS_KEY = ["admin", "orgs"] as const;

export function useListAdminOrgs(initial: AdminOrgRow[]) {
  return useQuery({
    queryKey: ADMIN_ORGS_KEY,
    initialData: initial,
    queryFn: async (): Promise<AdminOrgRow[]> => {
      const res = await fetch("/api/admin/orgs");
      if (!res.ok) {
        const err = await readApiError(res, "Failed to load orgs");
        throw err;
      }
      return (await res.json()) as AdminOrgRow[];
    },
  });
}

export function useCreateAdminOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateAdminOrgInput
    ): Promise<CreateAdminOrgResult> => {
      const res = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await readApiError(res, "Failed to create organization");
        throw err;
      }
      return (await res.json()) as CreateAdminOrgResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_ORGS_KEY }),
  });
}
