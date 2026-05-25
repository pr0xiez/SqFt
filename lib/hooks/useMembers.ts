"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMemberInput,
  MemberRole,
  MemberRow,
} from "@/components/settings/members/types";
import { readApiError } from "@/lib/api/errors";

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; role: MemberRole }) => {
      const res = await fetch(`/api/users/${args.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: args.role }),
      });
      if (!res.ok) {
        const err = await readApiError(res, "Failed to update role");
        throw err;
      }
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMemberInput) => {
      const res = await fetch(`/api/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await readApiError(res, "Failed to add member");
        throw err;
      }
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}
