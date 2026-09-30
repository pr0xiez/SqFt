import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estimateFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: { findMany: estimateFindMany },
  },
}));

const { getDashboardRevenue } = await import("@/lib/dashboard/revenue");

// Mon Jun 15 2026, noon local. June has 30 days, so this fixes the month at
// day 15 of 30 — squarely inside the third fixed week bucket (15-21) with a
// real "future" bucket (22-30) to exercise the isFuture short-circuit.
const FAKE_NOW = new Date(2026, 5, 15, 12, 0, 0, 0);

interface RevenueRowOpts {
  rate: number;
  qty: number;
  approvedAt: Date;
  markupPct?: number;
  depositPct?: number;
}

/** Minimal row shaped like revenue.ts's `revenueSelect` Prisma read — enough
 *  for `fromPrismaEstimate` + `computeEstimateView` to roll up a total. */
function makeRevenueRow({
  rate,
  qty,
  approvedAt,
  markupPct = 0,
  depositPct = 0.3,
}: RevenueRowOpts) {
  return {
    markupPct,
    depositPct,
    approvedAt,
    lineItems: [
      {
        id: 1,
        name: "Flooring",
        description: null,
        rate,
        qtyMode: "manual",
        qty,
        wastePct: 0,
        unitLabel: "sqft",
        linkedRoomIds: [],
        sortOrder: 0,
      },
    ],
    siteMeasure: { items: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getDashboardRevenue", () => {
  it("reports the month shape (totalDays/daysLeft/monthGoal) for the fixed reference date", async () => {
    estimateFindMany.mockResolvedValue([]);

    const result = await getDashboardRevenue("org1");

    expect(result.totalDays).toBe(30);
    expect(result.daysLeft).toBe(15);
    expect(result.monthGoal).toBe(65_000);
  });

  it("buckets each approved estimate's total into its fixed week and sums mtdTotal from all of them", async () => {
    const rowWeek1 = makeRevenueRow({
      rate: 10,
      qty: 10,
      approvedAt: new Date(2026, 5, 3, 12, 0, 0), // Jun 3 -> week "1-7"
    }); // total 100
    const rowWeek2 = makeRevenueRow({
      rate: 10,
      qty: 20,
      approvedAt: new Date(2026, 5, 10, 12, 0, 0), // Jun 10 -> week "8-14"
    }); // total 200
    const rowWeek3 = makeRevenueRow({
      rate: 10,
      qty: 30,
      markupPct: 10,
      approvedAt: new Date(2026, 5, 18, 12, 0, 0), // Jun 18 -> week "15-21"
    }); // subtotal 300 + 10% = 330

    estimateFindMany.mockResolvedValue([rowWeek1, rowWeek2, rowWeek3]);

    const result = await getDashboardRevenue("org1");

    expect(result.mtdTotal).toBe(630);
    expect(result.weeks).toHaveLength(4);

    const [w1, w2, w3, w4] = result.weeks;
    expect(w1).toMatchObject({
      label: "Jun 1–7",
      amount: 100,
      isCurrent: false,
      isFuture: false,
    });
    expect(w2).toMatchObject({
      label: "Jun 8–14",
      amount: 200,
      isCurrent: false,
      isFuture: false,
    });
    expect(w3).toMatchObject({
      label: "Jun 15–21",
      amount: 330,
      isCurrent: true,
      isFuture: false,
    });
    // The 4th bucket (22-30) hasn't started yet relative to "today" (15th).
    expect(w4).toMatchObject({
      label: "Jun 22–30",
      amount: 0,
      isCurrent: false,
      isFuture: true,
    });
  });

  it("excludes an estimate approved just outside a week's boundary from that bucket", async () => {
    const justBefore = makeRevenueRow({
      rate: 1,
      qty: 1,
      approvedAt: new Date(2026, 5, 7, 23, 59, 59, 998), // still within week 1
    });
    const justAfter = makeRevenueRow({
      rate: 1,
      qty: 100,
      approvedAt: new Date(2026, 5, 8, 0, 0, 0, 0), // rolls into week 2
    });

    estimateFindMany.mockResolvedValue([justBefore, justAfter]);

    const result = await getDashboardRevenue("org1");

    expect(result.weeks[0].amount).toBe(1);
    expect(result.weeks[1].amount).toBe(100);
  });

  it("returns zero mtdTotal and all-zero week buckets on the empty-data path", async () => {
    estimateFindMany.mockResolvedValue([]);

    const result = await getDashboardRevenue("org1");

    expect(result.mtdTotal).toBe(0);
    for (const week of result.weeks) {
      expect(week.amount).toBe(0);
    }
  });

  it("queries only approved estimates approved on/after the start of the current month", async () => {
    estimateFindMany.mockResolvedValue([]);

    await getDashboardRevenue("org1");

    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          status: "approved",
          approvedAt: { gte: new Date(2026, 5, 1) },
        },
      })
    );
  });
});
