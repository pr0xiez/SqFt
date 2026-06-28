// lib/dashboard/kpis.ts

import { computeEstimateView } from "@/lib/estimateView/compute";
import {
  fromPrismaEstimate,
  type PrismaEstimateForView,
} from "@/lib/estimateView/fromPrisma";
import { prisma } from "@/lib/prisma";

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

const revenueSelect = {
  markupPct: true,
  depositPct: true,
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
          note: true,
          text: true,
        },
      },
    },
  },
} as const;

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
    estimatesTotal,
    estimatesThisWeek,
    estimatesLastWeek,
    estimatesSentTotal,
    estimatesSentThisWeek,
    estimatesSentLastWeek,
    awaitingEstimates,
    won30d,
    lost30d,
    won60to30d,
    lost60to30d,
    acceptedMtd,
    acceptedLastMonthSamePeriod,
  ] = await Promise.all([
    prisma.siteMeasure.count({ where: { orgId } }),
    prisma.siteMeasure.count({ where: { orgId, createdAt: { gte: weekAgo } } }),
    prisma.siteMeasure.count({
      where: { orgId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
    }),
    prisma.estimate.count({ where: { orgId, status: { not: "draft" } } }),
    prisma.estimate.count({
      where: { orgId, status: { not: "draft" }, createdAt: { gte: weekAgo } },
    }),
    prisma.estimate.count({
      where: {
        orgId,
        status: { not: "draft" },
        createdAt: { gte: twoWeeksAgo, lt: weekAgo },
      },
    }),
    prisma.estimate.findMany({
      where: { orgId, status: { in: ["sent", "viewed"] } },
      select: { id: true, sentAt: true, validityDays: true },
    }),
    prisma.estimate.count({
      where: { orgId, status: "approved", approvedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.estimate.count({
      where: { orgId, status: "declined", declinedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.estimate.count({
      where: {
        orgId,
        status: "approved",
        approvedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    prisma.estimate.count({
      where: {
        orgId,
        status: "declined",
        declinedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    prisma.estimate.findMany({
      where: { orgId, status: "approved", approvedAt: { gte: monthStart } },
      select: revenueSelect,
    }),
    prisma.estimate.findMany({
      where: {
        orgId,
        status: "approved",
        approvedAt: { gte: lastMonthStart, lte: lastMonthSamePeriodEnd },
      },
      select: revenueSelect,
    }),
  ]);

  const bookedRevenueMtd = (acceptedMtd as PrismaEstimateForView[]).reduce(
    (sum: number, q) => sum + computeEstimateView(fromPrismaEstimate(q)).total,
    0
  );
  const bookedRevenueDelta =
    bookedRevenueMtd -
    (acceptedLastMonthSamePeriod as PrismaEstimateForView[]).reduce(
      (sum: number, q) =>
        sum + computeEstimateView(fromPrismaEstimate(q)).total,
      0
    );

  const expiringSoonCount = awaitingEstimates.filter((q) => {
    if (!q.sentAt) return false;
    const expiresAt = new Date(q.sentAt);
    expiresAt.setDate(expiresAt.getDate() + q.validityDays);
    return expiresAt <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length;

  const total30d = won30d + lost30d;
  const winRate30d = total30d === 0 ? 0 : Math.round((won30d / total30d) * 100);
  const totalPrev30d = won60to30d + lost60to30d;
  const winRatePrev =
    totalPrev30d === 0 ? 0 : Math.round((won60to30d / totalPrev30d) * 100);

  return {
    estimatesTotal,
    estimatesDelta: estimatesThisWeek - estimatesLastWeek,
    estimatesSentTotal,
    estimatesSentDelta: estimatesSentThisWeek - estimatesSentLastWeek,
    awaitingSignature: awaitingEstimates.length,
    expiringSoonCount,
    winRate30d,
    winRateDelta: winRate30d - winRatePrev,
    bookedRevenueMtd,
    bookedRevenueDelta,
  };
}
