"use client";

import { useQuery } from "@tanstack/react-query";
import type { CustomerActivity } from "@/lib/customers/activity";
import { apiFetch } from "@/lib/hooks/apiFetch";

/** The customer hub's history, invoices and schedule. Keyed under
 *  `["customers", id]` so customer mutations refresh it too. */
export function useCustomerActivity(id: number) {
  return useQuery({
    queryKey: ["customers", id, "activity"],
    queryFn: () =>
      apiFetch<CustomerActivity>(
        `/api/customers/${id}/activity`,
        undefined,
        "Failed to fetch customer activity"
      ),
    enabled: !!id,
    // Invoices, payments and schedule events change on other pages; always
    // revalidate when the hub mounts (cached data still renders first).
    staleTime: 0,
  });
}
