"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";

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

export function useLocations(customerId: number) {
  return useQuery({
    queryKey: ["locations", customerId],
    queryFn: () =>
      apiFetch<Location[]>(
        `/api/locations?customerId=${customerId}`,
        undefined,
        "Failed to fetch locations"
      ),
    enabled: !!customerId,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLocationInput) =>
      apiFetch<Location>(
        "/api/locations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Failed to create location"
      ),
    onSuccess: (loc) => {
      qc.invalidateQueries({ queryKey: ["locations", loc.customerId] });
      qc.invalidateQueries({ queryKey: ["customers", loc.customerId] });
    },
  });
}
