// lib/dashboard/revenue.ts

import { computeEstimateView } from "@/lib/estimateView/compute";
import {
  fromPrismaEstimate,
  type PrismaEstimateForView,
} from "@/lib/estimateView/fromPrisma";
import { prisma } from "@/lib/prisma";

export interface WeekSummary {
  label: string;
  amount: number;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface DashboardRevenue {
  mtdTotal: number;
  monthGoal: number;
  daysLeft: number;
  totalDays: number;
  weeks: WeekSummary[];
}

const MONTH_GOAL = 65_000;

const revenueSelect = {
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
          note: true,
          text: true,
        },
      },
    },
  },
} as const;

export async function getDashboardRevenue(
  orgId: string
): Promise<DashboardRevenue> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const daysLeft = totalDays - today;
  const monthStart = new Date(year, month, 1);

  const acceptedMtd = await prisma.estimate.findMany({
    where: { orgId, status: "approved", approvedAt: { gte: monthStart } },
    select: revenueSelect,
  });

  type AcceptedEstimateRow = PrismaEstimateForView & {
    approvedAt: Date | null;
  };

  const mtdTotal = (acceptedMtd as AcceptedEstimateRow[]).reduce(
    (sum, q) => sum + computeEstimateView(fromPrismaEstimate(q)).total,
    0
  );

  // Build 4 fixed week buckets (day ranges within the month)
  const weekBoundaries = [
    { start: 1, end: 7 },
    { start: 8, end: 14 },
    { start: 15, end: 21 },
    { start: 22, end: totalDays },
  ];

  const monthAbbr = now.toLocaleString("en-US", { month: "short" });

  const weeks: WeekSummary[] = weekBoundaries.map(({ start, end }) => {
    const label = `${monthAbbr} ${start}–${end}`;
    const isCurrent = today >= start && today <= end;
    const isFuture = start > today;

    if (isFuture) {
      return { label, amount: 0, isCurrent, isFuture };
    }

    const weekStart = new Date(year, month, start);
    const weekEnd = new Date(year, month, end, 23, 59, 59, 999);
    const amount = (acceptedMtd as AcceptedEstimateRow[])
      .filter(
        (q) =>
          q.approvedAt && q.approvedAt >= weekStart && q.approvedAt <= weekEnd
      )
      .reduce(
        (sum, q) => sum + computeEstimateView(fromPrismaEstimate(q)).total,
        0
      );

    return { label, amount, isCurrent, isFuture };
  });

  return {
    mtdTotal,
    monthGoal: MONTH_GOAL,
    daysLeft,
    totalDays,
    weeks,
  };
}
