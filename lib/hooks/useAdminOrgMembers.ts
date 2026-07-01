"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MemberRole,
  MemberRow,
} from "@/components/settings/members/types";
import { readApiError } from "@/lib/api/errors";

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

const key = (orgId: string) => ["admin", "orgs", orgId, "users"] as const;

export function useListAdminOrgMembers(orgId: string, initial: MemberRow[]) {
  return useQuery({
    queryKey: key(orgId),
    initialData: initial,
    queryFn: async (): Promise<MemberRow[]> => {
      const res = await fetch(`/api/admin/orgs/${orgId}/users`);
      if (!res.ok) throw await readApiError(res, "Failed to load members");
      return (await res.json()) as MemberRow[];
    },
  });
}

export function useCreateAdminOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAdminUserInput): Promise<MemberRow> => {
      const res = await fetch(`/api/admin/orgs/${orgId}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await readApiError(res, "Failed to add user");
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}

export function useUpdateAdminOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...patch
    }: UpdateAdminUserInput): Promise<MemberRow> => {
      const res = await fetch(`/api/admin/orgs/${orgId}/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw await readApiError(res, "Failed to update user");
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}
