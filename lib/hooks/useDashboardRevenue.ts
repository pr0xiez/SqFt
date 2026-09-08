"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardRevenue, WeekSummary } from "@/lib/dashboard/revenue";
import { apiFetch } from "@/lib/hooks/apiFetch";

export type { DashboardRevenue, WeekSummary };

export function useDashboardRevenue() {
  return useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: () =>
      apiFetch<DashboardRevenue>(
        "/api/dashboard/revenue",
        undefined,
        "Failed to fetch dashboard revenue"
      ),
  });
}
