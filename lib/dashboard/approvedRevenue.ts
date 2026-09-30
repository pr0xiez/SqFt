// lib/dashboard/approvedRevenue.ts
//
// Shared query + reduction for "approved estimate revenue in a date range" —
// the piece that `getDashboardKpis` (bookedRevenueMtd) and `getDashboardRevenue`
// (mtdTotal + weekly buckets) both need. Extracted so the expensive
// `computeEstimateView(fromPrismaEstimate(...))` reduction has exactly one
// implementation; each caller still runs its own query (kpis.ts also needs a
// prior-period comparison range revenue.ts doesn't), but both derive their
// numbers from this single code path instead of two independently-maintained
// copies.

import { computeEstimateView } from "@/lib/estimateView/compute";
import { fromPrismaEstimate } from "@/lib/estimateView/fromPrisma";
import { prisma } from "@/lib/prisma";

/** Prisma `select` covering everything `computeEstimateView` needs, plus
 *  `approvedAt` for callers that bucket by week/day within the range. */
export const approvedRevenueSelect = {
  markupPct: true,
  depositPct: true,
  approvedAt: true,
  lineItems: {
    select: {
      id: true,
      name: true,
      description: true,
      rate: true,
      qtyMode: true,
      qty: true,
      wastePct: true,
      unitLabel: true,
      linkedRoomIds: true,
      sortOrder: true,
    },
  },
  siteMeasure: {
    select: {
      items: {
        select: {
          id: true,
          type: true,
          name: true,
          shape: true,
          w: true,
          l: true,
          segments: true,
          note: true,
          text: true,
        },
      },
    },
  },
} as const;

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
  const rows = await prisma.estimate.findMany({
    where: {
      orgId,
      status: "approved",
      approvedAt: range.lte
        ? { gte: range.gte, lte: range.lte }
        : { gte: range.gte },
    },
    select: approvedRevenueSelect,
  });

  return rows.map((q) => ({
    approvedAt: q.approvedAt,
    total: computeEstimateView(fromPrismaEstimate(q)).total,
  }));
}

/** Approved estimates from `monthStart` through now (month-to-date). */
export function getMtdApprovedEstimates(
  orgId: string,
  monthStart: Date
): Promise<ApprovedRevenueRow[]> {
  return getApprovedEstimateRevenueRows(orgId, { gte: monthStart });
}
