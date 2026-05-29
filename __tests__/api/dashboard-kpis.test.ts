import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/dashboard/kpis", () => ({
  getDashboardKpis: vi.fn(),
}));

const stubSession = { user: { id: "u1", orgId: "org1", role: "lead" } };

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  requireSession: vi.fn().mockResolvedValue(stubSession as any),
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
      estimatesSentTotal: 9,
      estimatesSentDelta: 0,
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
