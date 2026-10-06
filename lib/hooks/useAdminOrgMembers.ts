"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MemberRole,
  MemberRow,
} from "@/components/settings/members/types";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";

export type CreateAdminUserInput = {
  name: string;
  email: string;
  role: MemberRole;
  password: string;
};

export type UpdateAdminUserInput = {
  userId: string;
  role?: MemberRole;
  title?: string | null;
  archived?: boolean;
};

export function useCreateAdminOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminUserInput) =>
      apiFetch<MemberRow>(
        `/api/admin/orgs/${orgId}/users`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to add user"
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.admin.orgUsers(orgId) }),
  });
}

export function useUpdateAdminOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...patch }: UpdateAdminUserInput) =>
      apiFetch<MemberRow>(
        `/api/admin/orgs/${orgId}/users/${userId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
        "Failed to update user"
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.admin.orgUsers(orgId) }),
  });
}
