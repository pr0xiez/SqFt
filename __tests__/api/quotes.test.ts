import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listQuotes: vi.fn(),
  createQuote: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

const { listQuotes, createQuote } = await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET, POST } = await import("@/app/api/quotes/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockListQuotes = vi.mocked(listQuotes);
const mockCreateQuote = vi.mocked(createQuote);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes", () => {
  it("returns the quotes list scoped to org", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockListQuotes.mockResolvedValue([{ id: 1 }] as any);
    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await GET(undefined as any);
    expect(res.status).toBe(200);
    expect(mockListQuotes).toHaveBeenCalledWith("org1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await GET(undefined as any);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/quotes", () => {
  it("creates a quote and returns 201", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreateQuote.mockResolvedValue({ id: 5, estimateId: 9 } as any);

    const req = makeRequest({ estimateId: 9 });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(201);
    expect(mockCreateQuote).toHaveBeenCalledWith("org1", { estimateId: 9 });
  });

  it("returns 404 when the estimate isn't in the org", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockCreateQuote.mockResolvedValue(null);
    const req = makeRequest({ estimateId: 99 });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(404);
  });

  it("returns 400 when estimateId is missing", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest({});
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
