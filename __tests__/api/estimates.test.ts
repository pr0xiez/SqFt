import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, noParams, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listEstimates: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    facets: { all: 0, draft: 0, sent: 0, approved: 0, declined: 0 },
  }),
  createEstimate: vi.fn(),
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

const { listEstimates, createEstimate } = await import("@/lib/repositories");
const { requireSession } = await import("@/lib/tenant");
const { GET, POST } = await import("@/app/api/estimates/route");

const mockList = vi.mocked(listEstimates);
const mockCreate = vi.mocked(createEstimate);
const mockRequireSession = vi.mocked(requireSession);

beforeEach(() => {
  vi.clearAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockRequireSession.mockResolvedValue(stubSession as any);
});

describe("GET /api/estimates", () => {
  it("401 for crew role", async () => {
    mockRequireSession.mockResolvedValue({
      user: { id: "u1", orgId: "org1", role: "crew" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates"),
      noParams
    );
    expect(res.status).toBe(401);
  });

  it("passes parsed params and returns the paginated envelope", async () => {
    mockList.mockResolvedValue({
      items: [
        {
          id: 1,
          total: 123,
          _count: { lineItems: 2 },
          lineItems: [],
          siteMeasure: { items: [], id: 9 },
          // biome-ignore lint/suspicious/noExplicitAny: test stub row
        } as any,
      ],
      total: 1,
      facets: { all: 1, draft: 0, sent: 0, approved: 1, declined: 0 },
    });
    const res = await GET(
      makeRequest(
        "GET",
        "http://x/api/estimates?page=2&perPage=50&status=approved&sort=total&dir=asc"
      ),
      noParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.facets.approved).toBe(1);
    expect(body.items[0].total).toBe(123);
    expect(body.items[0].lineItems).toBeUndefined();
    expect(body.items[0].siteMeasure.items).toBeUndefined();
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 2,
        perPage: 50,
        status: "approved",
        sort: { key: "total", direction: "asc" },
      })
    );
  });
});

describe("POST /api/estimates", () => {
  it("creates a estimate and returns 201", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 5, siteMeasureId: 9 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates", { siteMeasureId: 9 }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith("org1", { siteMeasureId: 9 });
  });

  it("returns NOT_FOUND when the siteMeasure isn't in the org", async () => {
    mockCreate.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates", { siteMeasureId: 99 }),
      params({})
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns VALIDATION_FAILED when siteMeasureId is missing", async () => {
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates", {}),
      params({})
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });
});
