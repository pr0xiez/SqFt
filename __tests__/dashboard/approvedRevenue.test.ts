import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateFindMany = vi.fn();
const estimateCount = vi.fn().mockResolvedValue(0);
const siteMeasureCount = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: {
      findMany: estimateFindMany,
      count: estimateCount,
    },
    siteMeasure: {
      count: siteMeasureCount,
    },
  },
}));

const { getApprovedEstimateRevenueRows, getMtdApprovedEstimates } =
  await import("@/lib/dashboard/approvedRevenue");
const { getDashboardKpis } = await import("@/lib/dashboard/kpis");
const { getDashboardRevenue } = await import("@/lib/dashboard/revenue");

beforeEach(() => vi.clearAllMocks());

/** A manual-qty estimate row: total = qty * rate * (1 + markupPct/100). */
function estimateRow(over: {
  approvedAt: Date | null;
  qty: number;
  rate: number;
  markupPct?: number;
}) {
  return {
    markupPct: over.markupPct ?? 0,
    depositPct: 0,
    approvedAt: over.approvedAt,
    lineItems: [
      {
        id: 1,
        name: "Flooring",
        description: null,
        rate: over.rate,
        qtyMode: "manual",
        qty: over.qty,
        wastePct: 0,
        unitLabel: "sqft",
        linkedRoomIds: [],
        sortOrder: 0,
      },
    ],
    siteMeasure: { items: [] },
  };
}

describe("getApprovedEstimateRevenueRows", () => {
  it("queries approved estimates in the given range and reduces each to {approvedAt, total}", async () => {
    const approvedAt = new Date("2026-08-10T12:00:00Z");
    estimateFindMany.mockResolvedValue([
      estimateRow({ approvedAt, qty: 100, rate: 5 }), // 500
    ]);

    const gte = new Date(2026, 7, 1);
    const rows = await getApprovedEstimateRevenueRows("org1", { gte });

    expect(rows).toEqual([{ approvedAt, total: 500 }]);
    expect(estimateFindMany).toHaveBeenCalledWith({
      where: { orgId: "org1", status: "approved", approvedAt: { gte } },
      select: expect.any(Object),
    });
  });

  it("passes an lte bound through to the query when provided", async () => {
    estimateFindMany.mockResolvedValue([]);
    const gte = new Date(2026, 6, 1);
    const lte = new Date(2026, 6, 15);

    await getApprovedEstimateRevenueRows("org1", { gte, lte });

    expect(estimateFindMany).toHaveBeenCalledWith({
      where: { orgId: "org1", status: "approved", approvedAt: { gte, lte } },
      select: expect.any(Object),
    });
  });

  it("includes multi-box area in booked revenue instead of treating null w/l as zero", async () => {
    const approvedAt = new Date("2026-08-10T12:00:00Z");
    const row = estimateRow({ approvedAt, qty: 0, rate: 2 });
    estimateFindMany.mockResolvedValue([
      {
        ...row,
        lineItems: [
          {
            ...row.lineItems[0],
            qtyMode: "linked_area",
            qty: null,
            linkedRoomIds: [10],
          },
        ],
        siteMeasure: {
          items: [
            {
              id: 10,
              type: "room",
              w: null,
              l: null,
              segments: [
                { w: 10, l: 12 },
                { w: 4, l: 3 },
              ],
            },
          ],
        },
      },
    ]);
    expect(
      await getApprovedEstimateRevenueRows("org1", {
        gte: new Date("2026-08-01"),
      })
    ).toEqual([{ approvedAt, total: 264 }]);
    expect(
      estimateFindMany.mock.calls[0][0].select.siteMeasure.select.items.select
        .segments
    ).toBe(true);
  });
});

describe("getMtdApprovedEstimates", () => {
  it("delegates to getApprovedEstimateRevenueRows with an open-ended range from monthStart", async () => {
    estimateFindMany.mockResolvedValue([]);
    const monthStart = new Date(2026, 7, 1);

    await getMtdApprovedEstimates("org1", monthStart);

    expect(estimateFindMany).toHaveBeenCalledWith({
      where: {
        orgId: "org1",
        status: "approved",
        approvedAt: { gte: monthStart },
      },
      select: expect.any(Object),
    });
  });
});

describe("getDashboardKpis and getDashboardRevenue share one query path", () => {
  it("both derive bookedRevenueMtd / mtdTotal from the same shared-select MTD query, run once each", async () => {
    const approvedAt = new Date();
    approvedAt.setDate(1); // safely within MTD range regardless of today

    // Every findMany call in getDashboardKpis / getDashboardRevenue resolves
    // to this same fixture; only the MTD-shaped one matters here.
    estimateFindMany.mockImplementation(({ where }) => {
      if (where.status === "approved" && "gte" in where.approvedAt) {
        return Promise.resolve([
          estimateRow({ approvedAt, qty: 40, rate: 10 }),
        ]); // 400
      }
      return Promise.resolve([]);
    });

    const kpis = await getDashboardKpis("org1");
    const revenue = await getDashboardRevenue("org1");

    expect(kpis.bookedRevenueMtd).toBe(400);
    expect(revenue.mtdTotal).toBe(400);
    expect(kpis.bookedRevenueMtd).toBe(revenue.mtdTotal);

    // Each dashboard function issues exactly one MTD-approved-revenue query
    // (kpis.ts also has a distinct prior-period comparison query, which is
    // out of scope for "MTD" and intentionally not deduped here).
    const mtdCalls = estimateFindMany.mock.calls.filter(
      ([{ where }]) =>
        where.status === "approved" &&
        "gte" in where.approvedAt &&
        !("lte" in where.approvedAt)
    );
    expect(mtdCalls).toHaveLength(2);
    // Both calls use the identical shared select shape.
    expect(mtdCalls[0][0].select).toEqual(mtdCalls[1][0].select);
  });
});
