"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";

export interface AssignableUser {
  id: string;
  name: string;
  title: string | null;
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: ["users", "assignable"],
    queryFn: () =>
      apiFetch<AssignableUser[]>(
        "/api/users/assignable",
        undefined,
        "Failed to fetch assignable users"
      ),
  });
}
