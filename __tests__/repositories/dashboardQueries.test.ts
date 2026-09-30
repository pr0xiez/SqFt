import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  estimateCount: vi.fn(),
  estimateFindMany: vi.fn(),
  siteMeasureCount: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: { count: mocks.estimateCount, findMany: mocks.estimateFindMany },
    siteMeasure: { count: mocks.siteMeasureCount },
  },
}));

import {
  getEstimateCreationCounts,
  getEstimateWinLossCounts,
  listApprovedEstimatesForRevenue,
  listAwaitingEstimates,
} from "@/lib/repositories/estimateRepo";
import { getSiteMeasureCreationCounts } from "@/lib/repositories/siteMeasureRepo";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.estimateCount.mockResolvedValue(0);
  mocks.estimateFindMany.mockResolvedValue([]);
  mocks.siteMeasureCount.mockResolvedValue(0);
});

describe("dashboard repository tenant boundaries", () => {
  it("scopes every creation, decision, awaiting, and revenue query to its org", async () => {
    const start = new Date("2026-06-01T00:00:00Z");
    const end = new Date("2026-06-08T00:00:00Z");
    await getEstimateCreationCounts("org-review", end, start);
    await getEstimateWinLossCounts("org-review", { gte: start, lt: end });
    await getSiteMeasureCreationCounts("org-review", end, start);
    await listAwaitingEstimates("org-review");
    await listApprovedEstimatesForRevenue("org-review", {
      gte: start,
      lte: end,
    });
    expect(mocks.estimateCount).toHaveBeenCalledTimes(5);
    expect(mocks.siteMeasureCount).toHaveBeenCalledTimes(3);
    expect(mocks.estimateFindMany).toHaveBeenCalledTimes(2);
    for (const mock of Object.values(mocks))
      for (const [query] of mock.mock.calls)
        expect(query.where.orgId).toBe("org-review");
    expect(mocks.estimateCount).toHaveBeenCalledWith({
      where: {
        orgId: "org-review",
        status: "declined",
        declinedAt: { gte: start, lt: end },
      },
    });
    expect(
      mocks.estimateFindMany.mock.calls[1][0].select.siteMeasure.select.items
        .select.segments
    ).toBe(true);
  });
});
