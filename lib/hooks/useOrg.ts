"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";

export interface Org {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  licenseNumber: string | null;
  logo: string | null;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string | null;
  showLicenseOnEstimates: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
}

export function useOrg() {
  return useQuery({
    queryKey: keys.org,
    queryFn: () => apiFetch<Org>("/api/org", undefined, "Failed to fetch org"),
  });
}
