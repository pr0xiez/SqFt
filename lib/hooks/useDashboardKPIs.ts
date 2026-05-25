"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardKpis } from "@/lib/dashboard/kpis";

export type { DashboardKpis };

async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const res = await fetch("/api/dashboard/kpis");
  if (!res.ok) throw new Error("Failed to fetch dashboard KPIs");
  return res.json();
}

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: fetchDashboardKpis,
  });
}
