"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Location {
  id: number;
  orgId: string;
  customerId: number;
  address: string;
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat?: number | null;
  lon?: number | null;
  label?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CreateLocationInput {
  customerId: number;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
  lat?: number;
  lon?: number;
  label?: string;
  notes?: string;
}

async function fetchLocations(customerId: number): Promise<Location[]> {
  const res = await fetch(`/api/locations?customerId=${customerId}`);
  if (!res.ok) throw new Error("Failed to fetch locations");
  return res.json();
}

export function useLocations(customerId: number) {
  return useQuery({
    queryKey: ["locations", customerId],
    queryFn: () => fetchLocations(customerId),
    enabled: !!customerId,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLocationInput) => {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create location");
      return res.json() as Promise<Location>;
    },
    onSuccess: (loc) => {
      qc.invalidateQueries({ queryKey: ["locations", loc.customerId] });
      qc.invalidateQueries({ queryKey: ["customers", loc.customerId] });
    },
  });
}
