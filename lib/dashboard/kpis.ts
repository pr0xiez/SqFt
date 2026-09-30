// lib/dashboard/kpis.ts

import { getApprovedEstimateRevenueRows } from "@/lib/dashboard/approvedRevenue";
import { round2 } from "@/lib/money";
import {
  getEstimateCreationCounts,
  getEstimateWinLossCounts,
  listAwaitingEstimates,
} from "@/lib/repositories/estimateRepo";
import { getSiteMeasureCreationCounts } from "@/lib/repositories/siteMeasureRepo";

export interface DashboardKpis {
  estimatesTotal: number;
  estimatesDelta: number;
  estimatesSentTotal: number;
  estimatesSentDelta: number;
  awaitingSignature: number;
  expiringSoonCount: number;
  winRate30d: number;
  winRateDelta: number;
  bookedRevenueMtd: number;
  bookedRevenueDelta: number;
}

export async function getDashboardKpis(orgId: string): Promise<DashboardKpis> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthSamePeriodEnd = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    now.getDate(),
    23,
    59,
    59,
    999
  );

  const [
    siteMeasureCounts,
    estimateCounts,
    awaitingEstimates,
    winLoss30d,
    winLoss60to30d,
    acceptedMtd,
    acceptedLastMonthSamePeriod,
  ] = await Promise.all([
    getSiteMeasureCreationCounts(orgId, weekAgo, twoWeeksAgo),
    getEstimateCreationCounts(orgId, weekAgo, twoWeeksAgo),
    listAwaitingEstimates(orgId),
    getEstimateWinLossCounts(orgId, { gte: thirtyDaysAgo }),
    getEstimateWinLossCounts(orgId, {
      gte: sixtyDaysAgo,
      lt: thirtyDaysAgo,
    }),
    getApprovedEstimateRevenueRows(orgId, { gte: monthStart }),
    getApprovedEstimateRevenueRows(orgId, {
      gte: lastMonthStart,
      lte: lastMonthSamePeriodEnd,
    }),
  ]);

  const bookedRevenueMtd = round2(
    acceptedMtd.reduce((sum, row) => sum + row.total, 0)
  );
  const bookedRevenueDelta = round2(
    bookedRevenueMtd -
      acceptedLastMonthSamePeriod.reduce((sum, row) => sum + row.total, 0)
  );

  const expiringSoonCount = awaitingEstimates.filter((q) => {
    if (!q.sentAt) return false;
    const expiresAt = new Date(q.sentAt);
    expiresAt.setDate(expiresAt.getDate() + q.validityDays);
    return expiresAt <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length;

  const total30d = winLoss30d.won + winLoss30d.lost;
  const winRate30d =
    total30d === 0 ? 0 : Math.round((winLoss30d.won / total30d) * 100);
  const totalPrev30d = winLoss60to30d.won + winLoss60to30d.lost;
  const winRatePrev =
    totalPrev30d === 0
      ? 0
      : Math.round((winLoss60to30d.won / totalPrev30d) * 100);

  return {
    // "Estimates" KPI card is actually a site-measures-started count — kept
    // as-is; only the data access moved into the repo layer.
    estimatesTotal: siteMeasureCounts.total,
    estimatesDelta: siteMeasureCounts.thisWeek - siteMeasureCounts.lastWeek,
    estimatesSentTotal: estimateCounts.total,
    estimatesSentDelta: estimateCounts.thisWeek - estimateCounts.lastWeek,
    awaitingSignature: awaitingEstimates.length,
    expiringSoonCount,
    winRate30d,
    winRateDelta: winRate30d - winRatePrev,
    bookedRevenueMtd,
    bookedRevenueDelta,
  };
}
