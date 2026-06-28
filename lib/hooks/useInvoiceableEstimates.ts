"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { InvoiceableCandidate } from "@/lib/quickCreate/candidates";

export interface InvoiceableEstimatesResponse {
  items: InvoiceableCandidate[];
  /** Org default deposit pct (decimal), used to seed the invoice dialog. */
  defaultDepositPct: number;
}

/**
 * Search billable estimates (those with a remaining balance) by customer for
 * the quick-invoice panel. Disabled until the user has typed something, so an
 * empty panel issues no request.
 */
export function useInvoiceableEstimates(q: string) {
  return useQuery({
    queryKey: ["estimates", "invoiceable", q],
    queryFn: async (): Promise<InvoiceableEstimatesResponse> => {
      const res = await fetch(
        `/api/estimates/invoiceable?q=${encodeURIComponent(q)}`
      );
      if (!res.ok) throw new Error("Failed to search estimates");
      return res.json();
    },
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}
