"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardRevenue, WeekSummary } from "@/lib/dashboard/revenue";

export type { DashboardRevenue, WeekSummary };

async function fetchDashboardRevenue(): Promise<DashboardRevenue> {
  const res = await fetch("/api/dashboard/revenue");
  if (!res.ok) throw new Error("Failed to fetch dashboard revenue");
  return res.json();
}

export function useDashboardRevenue() {
  return useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: fetchDashboardRevenue,
  });
}
