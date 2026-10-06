"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";

export interface AssignableUser {
  id: string;
  name: string;
  title: string | null;
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: keys.users.assignable,
    queryFn: () =>
      apiFetch<AssignableUser[]>(
        "/api/users/assignable",
        undefined,
        "Failed to fetch assignable users"
      ),
  });
}
