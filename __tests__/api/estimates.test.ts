import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listEstimates: vi.fn().mockResolvedValue([]),
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
const { GET, POST } = await import("@/app/api/estimates/route");

const mockList = vi.mocked(listEstimates);
const mockCreate = vi.mocked(createEstimate);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/estimates", () => {
  it("calls listEstimates scoped to org", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue([] as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates"),
      params({})
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("org1");
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
