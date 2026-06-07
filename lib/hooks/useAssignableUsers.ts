"use client";

import { useQuery } from "@tanstack/react-query";

export interface AssignableUser {
  id: string;
  name: string;
  title: string | null;
}

async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const res = await fetch("/api/users/assignable");
  if (!res.ok) throw new Error("Failed to fetch assignable users");
  return res.json();
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: ["users", "assignable"],
    queryFn: fetchAssignableUsers,
  });
}
