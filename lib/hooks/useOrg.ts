"use client";

import { useQuery } from "@tanstack/react-query";

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

async function fetchOrg(): Promise<Org> {
  const res = await fetch("/api/org");
  if (!res.ok) throw new Error("Failed to fetch org");
  return res.json();
}

export function useOrg() {
  return useQuery({
    queryKey: ["org"],
    queryFn: fetchOrg,
  });
}
