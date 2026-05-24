import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listQuotes: vi.fn().mockResolvedValue([]),
  createQuote: vi.fn(),
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

const { listQuotes, createQuote } = await import("@/lib/repositories");
const { GET, POST } = await import("@/app/api/quotes/route");

const mockList = vi.mocked(listQuotes);
const mockCreate = vi.mocked(createQuote);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/quotes", () => {
  it("calls listQuotes scoped to org", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue([] as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/quotes"),
      params({})
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("org1");
  });
});

describe("POST /api/quotes", () => {
  it("creates a quote and returns 201", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 5, estimateId: 9 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes", { estimateId: 9 }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith("org1", { estimateId: 9 });
  });

  it("returns NOT_FOUND when the estimate isn't in the org", async () => {
    mockCreate.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes", { estimateId: 99 }),
      params({})
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns VALIDATION_FAILED when estimateId is missing", async () => {
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes", {}),
      params({})
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });
});
