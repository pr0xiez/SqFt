"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CrewMember {
  id: number;
  orgId: string;
  name: string;
  role: string;
  archived: boolean;
  createdAt: string;
  _count?: { events: number };
}

export interface CreateCrewMemberInput {
  name: string;
  role?: string;
}

export interface UpdateCrewMemberInput {
  name?: string;
  role?: string;
  archived?: boolean;
}

async function fetchCrewMembers(
  includeArchived: boolean
): Promise<CrewMember[]> {
  const url = includeArchived
    ? "/api/crew-members?includeArchived=1"
    : "/api/crew-members";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch crew members");
  return res.json();
}

export function useCrewMembers(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: ["crew-members", { includeArchived }],
    queryFn: () => fetchCrewMembers(includeArchived),
  });
}

export function useCreateCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCrewMemberInput) => {
      const res = await fetch("/api/crew-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create crew member");
      return res.json() as Promise<CrewMember>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-members"] }),
  });
}

export function useUpdateCrewMember(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateCrewMemberInput) => {
      const res = await fetch(`/api/crew-members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update crew member");
      return res.json() as Promise<CrewMember>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-members"] }),
  });
}

export function useDeleteCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/crew-members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to delete crew member");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-members"] }),
  });
}
