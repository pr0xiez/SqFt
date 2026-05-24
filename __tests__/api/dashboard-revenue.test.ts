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
