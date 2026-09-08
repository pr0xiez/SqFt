// lib/dashboard/revenue.ts

import { round2 } from "@/lib/money";

import { getMtdApprovedEstimates } from "@/lib/dashboard/approvedRevenue";

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

  const acceptedMtd = await getMtdApprovedEstimates(orgId, monthStart);

  const mtdTotal = round2(acceptedMtd.reduce((sum, r) => sum + r.total, 0));

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
    const amount = round2(acceptedMtd
      .filter(
        (r) =>
          r.approvedAt && r.approvedAt >= weekStart && r.approvedAt <= weekEnd
      )
      .reduce((sum, r) => sum + r.total, 0));

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
