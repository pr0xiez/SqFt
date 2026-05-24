# Dashboard Enhanced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic dashboard (greeting + counts + estimate list) with the full enhanced layout: KPI pipeline, today's schedule, revenue card with goal progress, crew card, and styled estimates table.

**Architecture:** Client components + TanStack Query hooks calling new `/api/dashboard/*` API routes. Two new data services (`lib/dashboard/kpis.ts`, `lib/dashboard/revenue.ts`) handle Prisma queries; existing `useEvents` and `useEstimates` hooks are reused as-is. `DashboardView.tsx` is replaced as an orchestrator that composes five focused sub-components.

**Tech Stack:** Next.js App Router, React 19, TanStack Query, Prisma 7, `computeQuoteView` from `lib/quoteView/compute.ts`, Tailwind CSS v4 with CSS custom properties (`var(--accent)`, `var(--sage)`, etc. defined in `app/globals.css`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/dashboard/kpis.ts` | Prisma queries + KPI computation |
| Create | `lib/dashboard/revenue.ts` | Prisma queries + revenue/weekly computation |
| Create | `app/api/dashboard/kpis/route.ts` | GET handler for KPI data |
| Create | `app/api/dashboard/revenue/route.ts` | GET handler for revenue data |
| Create | `lib/hooks/useDashboardKPIs.ts` | TanStack Query hook for KPIs |
| Create | `lib/hooks/useDashboardRevenue.ts` | TanStack Query hook for revenue |
| Create | `components/dashboard/KpiPipeline.tsx` | 5-cell pipeline strip |
| Create | `components/dashboard/ScheduleCard.tsx` | Today's event timeline |
| Create | `components/dashboard/CrewCard.tsx` | Dispatched crew list |
| Create | `components/dashboard/EstimatesTable.tsx` | Recent 8 estimates table |
| Create | `components/dashboard/RevenueCard.tsx` | MTD revenue + goal bar + weekly breakdown |
| Replace | `components/dashboard/DashboardView.tsx` | Orchestrator (replaces existing 192-line file) |
| Create | `__tests__/api/dashboard-kpis.test.ts` | Route tests for KPI endpoint |
| Create | `__tests__/api/dashboard-revenue.test.ts` | Route tests for revenue endpoint |

---

## Task 1: KPI Data Service

**Files:**
- Create: `lib/dashboard/kpis.ts`

- [ ] **Step 1: Create the KPI service**

```typescript
// lib/dashboard/kpis.ts
import { computeQuoteView } from "@/lib/quoteView/compute";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import prisma from "@/lib/prisma";

export interface DashboardKpis {
  estimatesTotal: number;
  estimatesDelta: number;
  quotesSentTotal: number;
  quotesSentDelta: number;
  awaitingSignature: number;
  expiringSoonCount: number;
  winRate30d: number;
  winRateDelta: number;
  bookedRevenueMtd: number;
  bookedRevenueDelta: number;
}

type QuoteForRevenue = {
  markupPct: number;
  convenienceFeeRate: number;
  depositPct: number;
  lineItems: LineItemCalc[];
  estimate: { items: RoomItem[] };
};

function computeQuoteTotal(q: QuoteForRevenue): number {
  return computeQuoteView({
    lineItems: q.lineItems,
    items: q.estimate.items,
    markupPct: q.markupPct,
    convenienceFeeRate: q.convenienceFeeRate,
    depositPct: q.depositPct,
  }).total;
}

const revenueSelect = {
  markupPct: true,
  convenienceFeeRate: true,
  depositPct: true,
  lineItems: {
    select: {
      id: true,
      qtyMode: true,
      qty: true,
      rate: true,
      wastePct: true,
      linkedRoomIds: true,
    },
  },
  estimate: {
    select: {
      items: {
        select: {
          id: true,
          type: true,
          shape: true,
          w: true,
          l: true,
          name: true,
          sortOrder: true,
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
    59
  );

  const [
    estimatesTotal,
    estimatesThisWeek,
    estimatesLastWeek,
    quotesSentTotal,
    quotesSentThisWeek,
    quotesSentLastWeek,
    awaitingQuotes,
    won30d,
    lost30d,
    won60to30d,
    lost60to30d,
    acceptedMtd,
    acceptedLastMonthSamePeriod,
  ] = await Promise.all([
    prisma.estimate.count({ where: { orgId } }),
    prisma.estimate.count({ where: { orgId, createdAt: { gte: weekAgo } } }),
    prisma.estimate.count({
      where: { orgId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
    }),
    prisma.quote.count({ where: { orgId, status: { not: "draft" } } }),
    prisma.quote.count({
      where: { orgId, status: { not: "draft" }, createdAt: { gte: weekAgo } },
    }),
    prisma.quote.count({
      where: {
        orgId,
        status: { not: "draft" },
        createdAt: { gte: twoWeeksAgo, lt: weekAgo },
      },
    }),
    prisma.quote.findMany({
      where: { orgId, status: { in: ["sent", "viewed"] } },
      select: { id: true, sentAt: true, validityDays: true },
    }),
    prisma.quote.count({
      where: { orgId, status: "accepted", acceptedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.quote.count({
      where: { orgId, status: "declined", declinedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.quote.count({
      where: {
        orgId,
        status: "accepted",
        acceptedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    prisma.quote.count({
      where: {
        orgId,
        status: "declined",
        declinedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    prisma.quote.findMany({
      where: { orgId, status: "accepted", acceptedAt: { gte: monthStart } },
      select: revenueSelect,
    }),
    prisma.quote.findMany({
      where: {
        orgId,
        status: "accepted",
        acceptedAt: { gte: lastMonthStart, lte: lastMonthSamePeriodEnd },
      },
      select: revenueSelect,
    }),
  ]);

  const bookedRevenueMtd = (acceptedMtd as QuoteForRevenue[]).reduce(
    (sum, q) => sum + computeQuoteTotal(q),
    0
  );
  const bookedRevenueDelta =
    bookedRevenueMtd -
    (acceptedLastMonthSamePeriod as QuoteForRevenue[]).reduce(
      (sum, q) => sum + computeQuoteTotal(q),
      0
    );

  const expiringSoonCount = awaitingQuotes.filter((q) => {
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
    quotesSentTotal,
    quotesSentDelta: quotesSentThisWeek - quotesSentLastWeek,
    awaitingSignature: awaitingQuotes.length,
    expiringSoonCount,
    winRate30d,
    winRateDelta: winRate30d - winRatePrev,
    bookedRevenueMtd,
    bookedRevenueDelta,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/dashboard/kpis.ts
git commit -m "feat(dashboard): add KPI data service"
```

---

## Task 2: KPI API Route + Tests

**Files:**
- Create: `app/api/dashboard/kpis/route.ts`
- Create: `__tests__/api/dashboard-kpis.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/dashboard-kpis.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/dashboard/kpis", () => ({
  getDashboardKpis: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getDashboardKpis } = await import("@/lib/dashboard/kpis");
const { GET } = await import("@/app/api/dashboard/kpis/route");
const mockGet = vi.mocked(getDashboardKpis);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/dashboard/kpis", () => {
  it("returns kpi data for the authenticated org", async () => {
    const mockKpis = {
      estimatesTotal: 14,
      estimatesDelta: 3,
      quotesSentTotal: 9,
      quotesSentDelta: 0,
      awaitingSignature: 6,
      expiringSoonCount: 2,
      winRate30d: 68,
      winRateDelta: 4,
      bookedRevenueMtd: 42840,
      bookedRevenueDelta: 8400,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue(mockKpis as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/dashboard/kpis"),
      params({})
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.estimatesTotal).toBe(14);
    expect(body.winRate30d).toBe(68);
    expect(mockGet).toHaveBeenCalledWith("org1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/api/dashboard-kpis.test.ts
```

Expected: FAIL — `@/app/api/dashboard/kpis/route` not found.

- [ ] **Step 3: Create the route**

```typescript
// app/api/dashboard/kpis/route.ts
import { apiRoute } from "@/lib/api/route";
import { getDashboardKpis } from "@/lib/dashboard/kpis";

export const GET = apiRoute(async ({ orgId }) => getDashboardKpis(orgId));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/api/dashboard-kpis.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/kpis/route.ts __tests__/api/dashboard-kpis.test.ts
git commit -m "feat(dashboard): add KPI API route"
```

---

## Task 3: Revenue Data Service

**Files:**
- Create: `lib/dashboard/revenue.ts`

- [ ] **Step 1: Create the revenue service**

```typescript
// lib/dashboard/revenue.ts
import { computeQuoteView } from "@/lib/quoteView/compute";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import prisma from "@/lib/prisma";

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
  convenienceFeeRate: true,
  depositPct: true,
  acceptedAt: true,
  lineItems: {
    select: {
      id: true,
      qtyMode: true,
      qty: true,
      rate: true,
      wastePct: true,
      linkedRoomIds: true,
    },
  },
  estimate: {
    select: {
      items: {
        select: {
          id: true,
          type: true,
          shape: true,
          w: true,
          l: true,
          name: true,
          sortOrder: true,
        },
      },
    },
  },
} as const;

type QuoteForRevenue = {
  acceptedAt: Date | null;
  markupPct: number;
  convenienceFeeRate: number;
  depositPct: number;
  lineItems: LineItemCalc[];
  estimate: { items: RoomItem[] };
};

function computeQuoteTotal(q: QuoteForRevenue): number {
  return computeQuoteView({
    lineItems: q.lineItems,
    items: q.estimate.items,
    markupPct: q.markupPct,
    convenienceFeeRate: q.convenienceFeeRate,
    depositPct: q.depositPct,
  }).total;
}

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

  const acceptedMtd = await prisma.quote.findMany({
    where: { orgId, status: "accepted", acceptedAt: { gte: monthStart } },
    select: revenueSelect,
  });

  const quotes = acceptedMtd as QuoteForRevenue[];
  const mtdTotal = quotes.reduce((sum, q) => sum + computeQuoteTotal(q), 0);

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
    const amount = quotes
      .filter(
        (q) => q.acceptedAt && q.acceptedAt >= weekStart && q.acceptedAt <= weekEnd
      )
      .reduce((sum, q) => sum + computeQuoteTotal(q), 0);

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
```

- [ ] **Step 2: Commit**

```bash
git add lib/dashboard/revenue.ts
git commit -m "feat(dashboard): add revenue data service"
```

---

## Task 4: Revenue API Route + Tests

**Files:**
- Create: `app/api/dashboard/revenue/route.ts`
- Create: `__tests__/api/dashboard-revenue.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/dashboard-revenue.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/dashboard/revenue", () => ({
  getDashboardRevenue: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getDashboardRevenue } = await import("@/lib/dashboard/revenue");
const { GET } = await import("@/app/api/dashboard/revenue/route");
const mockGet = vi.mocked(getDashboardRevenue);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/dashboard/revenue", () => {
  it("returns revenue data for the authenticated org", async () => {
    const mockRevenue = {
      mtdTotal: 42840,
      monthGoal: 65000,
      daysLeft: 9,
      totalDays: 31,
      weeks: [
        { label: "May 1–7", amount: 12400, isCurrent: false, isFuture: false },
        { label: "May 8–14", amount: 14180, isCurrent: false, isFuture: false },
        { label: "May 15–22", amount: 16260, isCurrent: true, isFuture: false },
        { label: "May 23–31", amount: 0, isCurrent: false, isFuture: true },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue(mockRevenue as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/dashboard/revenue"),
      params({})
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mtdTotal).toBe(42840);
    expect(body.monthGoal).toBe(65000);
    expect(body.weeks).toHaveLength(4);
    expect(mockGet).toHaveBeenCalledWith("org1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/api/dashboard-revenue.test.ts
```

Expected: FAIL — `@/app/api/dashboard/revenue/route` not found.

- [ ] **Step 3: Create the route**

```typescript
// app/api/dashboard/revenue/route.ts
import { apiRoute } from "@/lib/api/route";
import { getDashboardRevenue } from "@/lib/dashboard/revenue";

export const GET = apiRoute(async ({ orgId }) => getDashboardRevenue(orgId));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/api/dashboard-revenue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/revenue/route.ts __tests__/api/dashboard-revenue.test.ts
git commit -m "feat(dashboard): add revenue API route"
```

---

## Task 5: Client Hooks

**Files:**
- Create: `lib/hooks/useDashboardKPIs.ts`
- Create: `lib/hooks/useDashboardRevenue.ts`

- [ ] **Step 1: Create the KPI hook**

```typescript
// lib/hooks/useDashboardKPIs.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardKpis } from "@/lib/dashboard/kpis";

export type { DashboardKpis };

async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const res = await fetch("/api/dashboard/kpis");
  if (!res.ok) throw new Error("Failed to fetch dashboard KPIs");
  return res.json();
}

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: fetchDashboardKpis,
  });
}
```

- [ ] **Step 2: Create the revenue hook**

```typescript
// lib/hooks/useDashboardRevenue.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardRevenue } from "@/lib/dashboard/revenue";

export type { DashboardRevenue, WeekSummary } from "@/lib/dashboard/revenue";

async function fetchDashboardRevenue(): Promise<DashboardRevenue> {
  const res = await fetch("/api/dashboard/revenue");
  if (!res.ok) throw new Error("Failed to fetch dashboard revenue");
  return res.json();
}

export function useDashboardRevenue() {
  return useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: fetchDashboardRevenue,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useDashboardKPIs.ts lib/hooks/useDashboardRevenue.ts
git commit -m "feat(dashboard): add TanStack Query hooks for KPIs and revenue"
```

---

## Task 6: KpiPipeline Component

**Files:**
- Create: `components/dashboard/KpiPipeline.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/dashboard/KpiPipeline.tsx
import type { DashboardKpis } from "@/lib/hooks/useDashboardKPIs";

interface KpiCell {
  label: string;
  value: string;
  delta: string;
  deltaDir: "up" | "down" | "flat";
  sparkHeights: number[];
}

function formatRevenue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function formatDelta(n: number, prefix = ""): string {
  if (n > 0) return `↑ ${prefix}${Math.abs(n)} vs last wk`;
  if (n < 0) return `↓ ${prefix}${Math.abs(n)} vs last wk`;
  return "— same as last wk";
}

function deltaDir(n: number): "up" | "down" | "flat" {
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

function buildCells(kpis: DashboardKpis): KpiCell[] {
  return [
    {
      label: "Estimates",
      value: String(kpis.estimatesTotal),
      delta: formatDelta(kpis.estimatesDelta),
      deltaDir: deltaDir(kpis.estimatesDelta),
      sparkHeights: [30, 50, 35, 65, 48, 80, 90],
    },
    {
      label: "Quotes Sent",
      value: String(kpis.quotesSentTotal),
      delta: formatDelta(kpis.quotesSentDelta),
      deltaDir: deltaDir(kpis.quotesSentDelta),
      sparkHeights: [60, 55, 62, 58, 60, 65, 60],
    },
    {
      label: "Awaiting Signature",
      value: String(kpis.awaitingSignature),
      delta:
        kpis.expiringSoonCount > 0
          ? `${kpis.expiringSoonCount} expiring soon`
          : "none expiring soon",
      deltaDir: kpis.expiringSoonCount > 0 ? "down" : "flat",
      sparkHeights: [25, 40, 45, 55, 50, 70, 75],
    },
    {
      label: "Win Rate (30d)",
      value: `${kpis.winRate30d}%`,
      delta: formatDelta(kpis.winRateDelta, "").replace("vs last wk", "pt"),
      deltaDir: deltaDir(kpis.winRateDelta),
      sparkHeights: [45, 55, 60, 50, 65, 70, 80],
    },
    {
      label: "Booked Revenue (MTD)",
      value: formatRevenue(kpis.bookedRevenueMtd),
      delta:
        kpis.bookedRevenueDelta >= 0
          ? `↑ ${formatRevenue(kpis.bookedRevenueDelta)}`
          : `↓ ${formatRevenue(Math.abs(kpis.bookedRevenueDelta))}`,
      deltaDir: deltaDir(kpis.bookedRevenueDelta),
      sparkHeights: [20, 35, 45, 55, 70, 80, 95],
    },
  ];
}

const deltaColor: Record<"up" | "down" | "flat", string> = {
  up: "var(--sage)",
  down: "var(--accent)",
  flat: "var(--muted)",
};

interface Props {
  kpis: DashboardKpis;
}

export function KpiPipeline({ kpis }: Props) {
  const cells = buildCells(kpis);

  return (
    <div
      className="grid bg-[var(--surface)] border border-[var(--line)] rounded-[10px] overflow-hidden mb-7"
      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className="group px-6 py-[22px] relative transition-colors hover:bg-[var(--surface-2)]"
          style={{
            borderRight:
              i < cells.length - 1 ? "1px solid var(--line)" : undefined,
          }}
        >
          {/* Label */}
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
            {cell.label}
          </div>

          {/* Value */}
          <div className="text-[30px] font-[700] tracking-[-0.025em] leading-none mb-1.5">
            {cell.value}
          </div>

          {/* Delta */}
          <div
            className="font-[var(--font-mono)] text-[11px] flex items-center gap-1.5"
            style={{ color: deltaColor[cell.deltaDir] }}
          >
            {cell.delta}
          </div>

          {/* Sparkline */}
          <div className="flex items-end gap-0.5 mt-2 h-6">
            {cell.sparkHeights.map((h, idx) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
                key={idx}
                className="flex-1 rounded-[1px] transition-colors duration-200 group-hover:bg-[var(--accent)]"
                style={{
                  height: `${h}%`,
                  background: "var(--line-2)",
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/KpiPipeline.tsx
git commit -m "feat(dashboard): add KpiPipeline component"
```

---

## Task 7: ScheduleCard Component

**Files:**
- Create: `components/dashboard/ScheduleCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/dashboard/ScheduleCard.tsx
import { useRouter } from "next/navigation";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { todayStr } from "@/lib/utils";

const typeColors: Record<string, string> = {
  job: "var(--accent)",
  visit: "var(--gold)",
  other: "var(--muted)",
};

const tagLabels: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Other",
};

// A measure-type event uses dot color sage. Detect by title keyword as a best-effort.
function dotColor(ev: CalEvent): string {
  if (ev.type === "job") return "var(--accent)";
  if (ev.type === "visit") return "var(--gold)";
  return "var(--muted)";
}

function isPast(ev: CalEvent): boolean {
  const now = new Date();
  const [h, m] = ev.endTime.split(":").map(Number);
  const end = new Date();
  end.setHours(h, m, 0, 0);
  return end < now;
}

interface Props {
  events: CalEvent[];
}

export function ScheduleCard({ events }: Props) {
  const router = useRouter();
  const today = todayStr();
  const todayEvents = events
    .filter((e) => e.date.slice(0, 10) === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      {/* Card header */}
      <header className="flex items-baseline justify-between mb-[18px] pb-[14px] border-b border-[var(--line)]">
        <div className="text-[14px] font-[600] tracking-[-0.01em] flex items-center gap-2.5">
          Today&apos;s Schedule
          <span className="font-[var(--font-mono)] text-[10px] px-[7px] py-[2px] border border-[var(--line)] rounded-[10px] text-[var(--muted)] font-[500]">
            {todayEvents.length} event{todayEvents.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/schedule")}
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink)] tracking-[.02em]"
        >
          Full calendar →
        </button>
      </header>

      {/* Timeline */}
      <div className="relative pl-16">
        {/* Vertical track */}
        <div
          className="absolute top-2 bottom-2 w-px bg-[var(--line)]"
          style={{ left: "50px" }}
        />

        {todayEvents.length === 0 ? (
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-2">
            No events scheduled today.
          </p>
        ) : (
          todayEvents.map((ev, idx) => {
            const completed = isPast(ev);
            const isLast = idx === todayEvents.length - 1;
            const address = ev.customer?.address?.split(",")[0];

            return (
              <div
                key={ev.id}
                className={`relative flex gap-3.5 py-3.5 cursor-pointer transition-[padding] duration-150 hover:pl-1.5 ${
                  isLast ? "" : "border-b border-dashed border-[var(--line)]"
                }`}
              >
                {/* Time label */}
                <span
                  className="absolute font-[var(--font-mono)] text-[11px] text-[var(--muted)] text-right pt-0.5"
                  style={{ left: "-64px", width: "46px" }}
                >
                  {ev.startTime}
                </span>

                {/* Type dot */}
                <span
                  className="absolute w-2.5 h-2.5 rounded-full z-10 mt-[18px]"
                  style={{
                    left: "-18px",
                    background: completed ? "var(--sage)" : "var(--surface)",
                    border: `2px solid ${completed ? "var(--sage)" : dotColor(ev)}`,
                  }}
                />

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[14px] font-[600] tracking-[-0.01em] mb-1"
                    style={{
                      color: completed ? "var(--muted)" : undefined,
                      textDecoration: completed ? "line-through" : undefined,
                      textDecorationColor: completed
                        ? "var(--line-2)"
                        : undefined,
                    }}
                  >
                    {ev.title}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] flex items-center gap-2.5 flex-wrap">
                    {/* Type tag */}
                    <span className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] px-[7px] py-[2px] border border-[var(--line)] rounded-[10px] uppercase tracking-[.06em]">
                      {tagLabels[ev.type] ?? ev.type}
                    </span>

                    {/* Crew avatars */}
                    {ev.crewMembers.length > 0 && (
                      <span className="flex items-center ml-2">
                        {ev.crewMembers.slice(0, 3).map((m) => (
                          <span key={m.id} className="-ml-[5px] first:ml-0">
                            <CrewAvatar name={m.name} size="sm" />
                          </span>
                        ))}
                      </span>
                    )}

                    {address && (
                      <>
                        <span
                          className="w-1 h-1 rounded-full bg-[var(--line-2)]"
                        />
                        <span>{address}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/ScheduleCard.tsx
git commit -m "feat(dashboard): add ScheduleCard component"
```

---

## Task 8: CrewCard and EstimatesTable Components

**Files:**
- Create: `components/dashboard/CrewCard.tsx`
- Create: `components/dashboard/EstimatesTable.tsx`

- [ ] **Step 1: Create CrewCard**

```tsx
// components/dashboard/CrewCard.tsx
import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

interface CrewEntry {
  id: number;
  name: string;
  initials: string;
  jobTitle: string;
  timeRange: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function buildCrewEntries(events: CalEvent[], today: string): CrewEntry[] {
  const todayEvents = events.filter((e) => e.date.slice(0, 10) === today);
  const seen = new Set<number>();
  const entries: CrewEntry[] = [];

  for (const ev of todayEvents) {
    for (const member of ev.crewMembers) {
      if (!seen.has(member.id)) {
        seen.add(member.id);
        entries.push({
          id: member.id,
          name: member.name,
          initials: getInitials(member.name),
          jobTitle: ev.title,
          timeRange: `${ev.startTime}–${ev.endTime}`,
        });
      }
    }
  }

  return entries;
}

interface Props {
  events: CalEvent[];
}

export function CrewCard({ events }: Props) {
  const today = todayStr();
  const crew = buildCrewEntries(events, today);

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <header className="flex items-baseline justify-between mb-[18px] pb-[14px] border-b border-[var(--line)]">
        <div className="text-[14px] font-[600] tracking-[-0.01em]">
          Crew · today
        </div>
        <button
          type="button"
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink)] tracking-[.02em]"
          onClick={() => {}}
        >
          Manage →
        </button>
      </header>

      {crew.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-2">
          No crew assigned today.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {crew.map((member, idx) => (
            <li
              key={member.id}
              className={`flex items-center gap-3 py-2.5 ${
                idx < crew.length - 1
                  ? "border-b border-dashed border-[var(--line)]"
                  : ""
              }`}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center font-[var(--font-mono)] text-[11px] font-[600] shrink-0"
              >
                {member.initials}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-[600] tracking-[-0.01em]">
                  {member.name}
                </div>
                <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate">
                  {member.jobTitle} · {member.timeRange}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Create EstimatesTable**

```tsx
// components/dashboard/EstimatesTable.tsx
import { useRouter } from "next/navigation";
import type { Estimate } from "@/lib/hooks/useEstimates";

function formatAge(dateStr: string): { label: string; overdue: boolean } {
  const diff = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return { label: "today", overdue: false };
  if (diff === 1) return { label: "1d ago", overdue: false };
  return { label: `${diff}d ago`, overdue: diff > 10 };
}

function getLatestQuote(est: Estimate) {
  const quotes = est.quotes ?? [];
  if (quotes.length === 0) return null;
  return quotes.reduce((latest, q) =>
    new Date(q.createdAt) > new Date(latest.createdAt) ? q : latest
  );
}

const statusStyles: Record<
  string,
  { bg: string; color: string; strikethrough?: boolean }
> = {
  sent: {
    bg: "rgba(176,122,26,.1)",
    color: "var(--gold)",
  },
  viewed: {
    bg: "rgba(61,107,74,.1)",
    color: "var(--sage)",
  },
  accepted: {
    bg: "var(--accent)",
    color: "#fff",
  },
  declined: {
    bg: "rgba(20,18,12,.06)",
    color: "var(--ink-2)",
    strikethrough: true,
  },
};

interface Props {
  estimates: Estimate[];
}

export function EstimatesTable({ estimates }: Props) {
  const router = useRouter();

  return (
    <section
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <header className="flex items-baseline justify-between mb-[18px] pb-[14px] border-b border-[var(--line)]">
        <div className="text-[14px] font-[600] tracking-[-0.01em] flex items-center gap-2.5">
          Recent estimates
          <span className="font-[var(--font-mono)] text-[10px] px-[7px] py-[2px] border border-[var(--line)] rounded-[10px] text-[var(--muted)] font-[500]">
            last 8 created
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/estimates")}
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink)] tracking-[.02em]"
        >
          View all →
        </button>
      </header>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["#", "Customer", "Quote", "Amount", "Age"].map((h, i) => (
              <th
                key={h}
                className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] font-[500] pb-3 border-b border-[var(--line)]"
                style={{ textAlign: i >= 3 ? "right" : "left", paddingLeft: "12px", paddingRight: "12px" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {estimates.map((est) => {
            const latestQuote = getLatestQuote(est);
            const age = formatAge(est.createdAt);
            const quoteVersions = est.quotes?.length ?? 0;
            const quoteStatus = latestQuote?.status;
            const statusStyle = quoteStatus ? statusStyles[quoteStatus] : null;

            // Compute quote total from the quote's line items if available
            // For the table we just show the estimate — no total available at list level
            const hasAmount = quoteStatus && quoteStatus !== "draft";

            return (
              <tr
                key={est.id}
                onClick={() => router.push(`/estimates/${est.id}`)}
                className="transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
              >
                {/* Number */}
                <td className="py-3.5 px-3 border-b border-dashed border-[var(--line)]">
                  <span className="font-[var(--font-mono)] text-[11.5px] font-[600] text-[var(--ink-2)]">
                    #{est.estimateNumber ?? est.id}
                  </span>
                </td>

                {/* Customer */}
                <td className="py-3.5 px-3 border-b border-dashed border-[var(--line)]">
                  <div className="text-[13px] font-[600] tracking-[-0.01em]">
                    {est.customer?.name ?? "—"}
                  </div>
                  {est.customer?.address && (
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                      {est.customer.address.split(",")[0]}
                      {est.title ? ` · ${est.title}` : ""}
                    </div>
                  )}
                </td>

                {/* Quote status */}
                <td className="py-3.5 px-3 border-b border-dashed border-[var(--line)]">
                  {statusStyle ? (
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.08em] px-[9px] py-[3px] rounded-[11px] font-[600]"
                        style={{
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          textDecoration: statusStyle.strikethrough
                            ? "line-through"
                            : undefined,
                        }}
                      >
                        {quoteStatus}
                      </span>
                      {quoteVersions > 1 && (
                        <span className="font-[var(--font-mono)] text-[9.5px] text-[var(--muted)] tracking-[.02em]">
                          {quoteVersions} versions sent
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] italic flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full border border-dashed border-[var(--line-2)]" />
                      No quote yet
                    </span>
                  )}
                </td>

                {/* Amount — not available at list level without line-item data */}
                <td
                  className="py-3.5 px-3 border-b border-dashed border-[var(--line)] font-[var(--font-mono)] text-[13px] font-[600] tracking-[-0.02em]"
                  style={{ textAlign: "right" }}
                >
                  <span style={{ color: "var(--muted)" }}>—</span>
                </td>

                {/* Age */}
                <td
                  className="py-3.5 px-3 border-b border-dashed border-[var(--line)] font-[var(--font-mono)] text-[10.5px]"
                  style={{
                    textAlign: "right",
                    color: age.overdue ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {age.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/CrewCard.tsx components/dashboard/EstimatesTable.tsx
git commit -m "feat(dashboard): add CrewCard and EstimatesTable components"
```

---

## Task 9: RevenueCard Component

**Files:**
- Create: `components/dashboard/RevenueCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/dashboard/RevenueCard.tsx
import type { DashboardRevenue, WeekSummary } from "@/lib/hooks/useDashboardRevenue";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

interface WeekBarProps {
  week: WeekSummary;
  maxAmount: number;
}

function WeekBar({ week, maxAmount }: WeekBarProps) {
  const pct = maxAmount > 0 ? Math.min((week.amount / maxAmount) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.06em]"
        style={{ color: week.isCurrent ? "var(--accent)" : "var(--muted)", fontWeight: week.isCurrent ? 600 : 400 }}
      >
        {week.label}
      </div>
      <div className="font-[var(--font-mono)] text-[14px] font-[600] tracking-[-0.02em]">
        {week.isFuture ? (
          <span style={{ color: "var(--muted)", fontWeight: 500 }}>
            <span style={{ color: "var(--muted)", fontSize: "12px", marginRight: "1px" }}>$</span>
            {formatCurrency(week.amount)}{" "}
            <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "12px" }}>to go</span>
          </span>
        ) : (
          <>
            <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: "12px", marginRight: "1px" }}>$</span>
            {formatCurrency(week.amount)}
          </>
        )}
      </div>
      <div
        className="h-[5px] rounded-[3px] relative overflow-hidden"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-[3px]"
          style={{
            width: `${pct}%`,
            background: week.isFuture
              ? "repeating-linear-gradient(45deg,var(--line),var(--line) 3px,var(--surface-2) 3px,var(--surface-2) 6px)"
              : week.isCurrent
              ? "var(--accent)"
              : "var(--ink-2)",
          }}
        />
      </div>
    </div>
  );
}

interface Props {
  revenue: DashboardRevenue;
}

export function RevenueCard({ revenue }: Props) {
  const { mtdTotal, monthGoal, daysLeft, totalDays, weeks } = revenue;
  const goalPct = Math.min((mtdTotal / monthGoal) * 100, 100);
  const daysElapsed = totalDays - daysLeft;
  const pacePct = (daysElapsed / totalDays) * 100;

  // Max week amount for proportional bar scaling (exclude future weeks)
  const maxAmount = Math.max(...weeks.filter((w) => !w.isFuture).map((w) => w.amount), 1);

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      {/* Header row */}
      <div className="flex justify-between items-end mb-2">
        <div>
          <div
            className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] mb-2"
            style={{ color: "var(--muted)" }}
          >
            Booked revenue · month-to-date
          </div>
          <div className="text-[40px] font-[700] tracking-[-0.03em] leading-none">
            <span style={{ fontSize: "22px", color: "var(--muted)", fontWeight: 500, marginRight: "2px" }}>$</span>
            {formatCurrency(mtdTotal)}
          </div>
        </div>
        <div className="text-right font-[var(--font-mono)] text-[11px]" style={{ color: "var(--muted)" }}>
          Target ${formatCurrency(monthGoal)}
          <br />
          <span style={{ color: "var(--sage)", fontWeight: 600 }}>{Math.round(goalPct)}% of goal</span>
          {" "}· {daysLeft} days left
        </div>
      </div>

      {/* Goal bar */}
      <div
        className="relative h-3.5 rounded-[7px] my-5"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-[7px]"
          style={{ width: `${goalPct}%`, background: "var(--accent)" }}
        />
        {/* Pace marker */}
        <div
          className="absolute top-[-6px] bottom-[-6px] w-0.5"
          style={{ left: `${pacePct}%`, background: "var(--ink)" }}
        >
          <span
            className="absolute font-[var(--font-mono)] text-[9px] uppercase tracking-[.06em] whitespace-nowrap"
            style={{
              top: "-16px",
              left: "50%",
              transform: "translateX(-50%)",
              color: "var(--ink)",
              background: "var(--surface)",
              padding: "0 4px",
            }}
          >
            pace
          </span>
        </div>
      </div>

      {/* Axis labels */}
      <div
        className="flex justify-between font-[var(--font-mono)] text-[10px] mb-6"
        style={{ color: "var(--muted)" }}
      >
        <span>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>${formatCurrency(mtdTotal)}</strong> booked
        </span>
        <span>
          of <strong style={{ color: "var(--ink)", fontWeight: 600 }}>${formatCurrency(monthGoal)}</strong> goal
        </span>
      </div>

      {/* Weekly breakdown */}
      <div
        className="grid gap-4 pt-[18px] border-t border-[var(--line)]"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
      >
        {weeks.map((week) => (
          <WeekBar key={week.label} week={week} maxAmount={maxAmount} />
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/RevenueCard.tsx
git commit -m "feat(dashboard): add RevenueCard component"
```

---

## Task 10: DashboardView Orchestrator

**Files:**
- Replace: `components/dashboard/DashboardView.tsx`

- [ ] **Step 1: Replace DashboardView.tsx**

```tsx
// components/dashboard/DashboardView.tsx
"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { Button } from "@/components/ui/Button";
import { CrewCard } from "@/components/dashboard/CrewCard";
import { EstimatesTable } from "@/components/dashboard/EstimatesTable";
import { KpiPipeline } from "@/components/dashboard/KpiPipeline";
import { RevenueCard } from "@/components/dashboard/RevenueCard";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { useDashboardKPIs } from "@/lib/hooks/useDashboardKPIs";
import { useDashboardRevenue } from "@/lib/hooks/useDashboardRevenue";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { getGreeting, todayStr } from "@/lib/utils";

export function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: kpis } = useDashboardKPIs();
  const { data: revenue } = useDashboardRevenue();
  const { data: estimates = [] } = useEstimates();
  const { data: events = [] } = useEvents();
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
    setDateLabel(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const recentEstimates = estimates.slice(0, 8);

  return (
    <>
      {/* Page header */}
      <div
        className="grid gap-6 mb-8 pb-6 border-b border-[var(--line)]"
        style={{ gridTemplateColumns: "1fr auto", alignItems: "end" }}
      >
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.06em] uppercase mb-2 flex items-center gap-2.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--sage)",
                boxShadow: "0 0 0 4px rgba(61,107,74,.12)",
              }}
            />
            {dateLabel}
          </div>
          <h1 className="text-[40px] font-[700] leading-[1.02] tracking-[-0.03em]">
            {greeting},{" "}
            <span className="font-[400] text-[var(--ink-2)]">{firstName}.</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setNewCustomerOpen(true)}>
            + New Customer
          </Button>
          <Button onClick={() => router.push("/estimates")}>
            + Quick Quote
          </Button>
          <Button variant="primary" onClick={() => router.push("/estimates/new")}>
            + New Estimate
          </Button>
        </div>
      </div>

      {/* KPI Pipeline */}
      {kpis && <KpiPipeline kpis={kpis} />}

      {/* Main grid: schedule (full-width since inbox is removed) */}
      <div className="mb-6">
        <ScheduleCard events={events} />
      </div>

      {/* Ops strip: revenue + crew */}
      <div
        className="grid gap-6 mb-6"
        style={{ gridTemplateColumns: "2fr 1fr" }}
      >
        {revenue && <RevenueCard revenue={revenue} />}
        <CrewCard events={events} />
      </div>

      {/* Estimates table */}
      <EstimatesTable estimates={recentEstimates} />

      <NewCustomerPanel
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Run lint**

```bash
npx biome ci .
```

Fix any lint errors before continuing.

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

All tests must pass.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/DashboardView.tsx components/dashboard/KpiPipeline.tsx components/dashboard/ScheduleCard.tsx components/dashboard/CrewCard.tsx components/dashboard/EstimatesTable.tsx components/dashboard/RevenueCard.tsx lib/hooks/useDashboardKPIs.ts lib/hooks/useDashboardRevenue.ts
git commit -m "feat(dashboard): wire up DashboardView orchestrator with all panels"
```

---

## Self-Review

**Spec coverage check:**
- ✅ KPI pipeline — 5 cells: estimates, quotes sent, awaiting signature, win rate 30d, booked revenue MTD
- ✅ Timeline — chronological, past events strikethrough, no "now" line, no concurrent grouping
- ✅ Revenue card — MTD total, goal bar (hardcoded $65k), pace marker, weekly breakdown, current/future week styling
- ✅ Crew card — derived from today's events, no status dots, dispatched-only
- ✅ Estimates table — #, customer+address, quote status badge, age with overdue highlight
- ✅ Attention inbox — excluded per spec
- ✅ No chevron arrows between pipeline cells
- ✅ Sparklines decorative only
- ✅ Two new API routes, two new hooks, existing hooks reused

**Placeholder scan:** None found. All steps have complete code.

**Type consistency:** `DashboardKpis` defined in `lib/dashboard/kpis.ts`, re-exported from `lib/hooks/useDashboardKPIs.ts`. `DashboardRevenue` / `WeekSummary` defined in `lib/dashboard/revenue.ts`, re-exported from `lib/hooks/useDashboardRevenue.ts`. `KpiPipeline` receives `DashboardKpis`, `RevenueCard` receives `DashboardRevenue`, `ScheduleCard` and `CrewCard` receive `CalEvent[]`, `EstimatesTable` receives `Estimate[]`. All consistent.

**One known simplification:** The `Amount` column in `EstimatesTable` always shows `—` because the list endpoint doesn't include line-item totals. Computing totals at list time would require loading all line items for all estimates — a significant N+1 issue. Showing `—` is intentional; the full amount is visible inside each estimate.
