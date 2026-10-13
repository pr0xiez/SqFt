// lib/dashboard/approvedRevenue.ts
//
// Shared query + reduction for "approved estimate revenue in a date range" —
// the piece that `getDashboardKpis` (bookedRevenueMtd) and `getDashboardRevenue`
// (mtdTotal + weekly buckets) both need. Extracted so the expensive
// `viewFromPrisma(...)` reduction has exactly one
// implementation; each caller still runs its own query (kpis.ts also needs a
// prior-period comparison range revenue.ts doesn't), but both derive their
// numbers from this single code path instead of two independently-maintained
// copies.

import { viewFromPrisma } from "@/lib/estimateView/viewFromPrisma";
import { listApprovedEstimatesForRevenue } from "@/lib/repositories/estimateRepo";

export { approvedRevenueSelect } from "@/lib/repositories/approvedRevenueSelect";

export interface ApprovedRevenueRow {
  approvedAt: Date | null;
  total: number;
}

/** Approved estimates whose `approvedAt` falls in `[gte, lte]` (`lte` optional
 *  = open-ended), reduced to `{ approvedAt, total }` via the single-source-of-
 *  truth `computeEstimateView`. */
export async function getApprovedEstimateRevenueRows(
  orgId: string,
  range: { gte: Date; lte?: Date }
): Promise<ApprovedRevenueRow[]> {
  const rows = await listApprovedEstimatesForRevenue(orgId, range);

  return rows.map((q) => ({
    approvedAt: q.approvedAt,
    total: viewFromPrisma(q).total,
  }));
}

/** Approved estimates from `monthStart` through now (month-to-date). */
export function getMtdApprovedEstimates(
  orgId: string,
  monthStart: Date
): Promise<ApprovedRevenueRow[]> {
  return getApprovedEstimateRevenueRows(orgId, { gte: monthStart });
}
