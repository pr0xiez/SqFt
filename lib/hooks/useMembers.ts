"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMemberInput,
  MemberRow,
  UpdateMemberInput,
} from "@/components/settings/members/types";
import { readApiError } from "@/lib/api/errors";

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpdateMemberInput) => {
      const { id, ...patch } = args;
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await readApiError(res, "Failed to update member");
      }
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
