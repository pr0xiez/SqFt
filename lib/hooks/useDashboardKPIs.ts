"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardKpis } from "@/lib/dashboard/kpis";
import { apiFetch } from "@/lib/hooks/apiFetch";

export type { DashboardKpis };

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () =>
      apiFetch<DashboardKpis>(
        "/api/dashboard/kpis",
        undefined,
        "Failed to fetch dashboard KPIs"
      ),
  });
}
