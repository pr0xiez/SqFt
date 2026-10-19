"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMemberInput,
  MemberRow,
  UpdateMemberInput,
} from "@/components/settings/members/types";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: UpdateMemberInput) => {
      const { id, ...patch } = args;
      return apiFetch<MemberRow>(
        `/api/users/${id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
        "Failed to update member"
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users.all }),
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemberInput) =>
      apiFetch<MemberRow>(
        "/api/users",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to add member"
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users.all }),
  });
}
