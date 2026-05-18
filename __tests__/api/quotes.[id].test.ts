import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuote: vi.fn(),
  saveQuote: vi.fn(),
  deleteQuote: vi.fn(),
  rotateApprovalToken: vi.fn(),
  QuoteHasEventsError: class QuoteHasEventsError extends Error {
    constructor(public readonly eventCount: number) {
      super(`Quote has ${eventCount} scheduled event(s)`);
      this.name = "QuoteHasEventsError";
    }
  },
}));

vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const {
  getQuote,
  saveQuote,
  deleteQuote,
  rotateApprovalToken,
  QuoteHasEventsError,
} = await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET, PATCH, DELETE } = await import("@/app/api/quotes/[id]/route");
const { POST: tokenPOST } = await import(
  "@/app/api/quotes/[id]/approval-token/route"
);

const mockGetOrgId = vi.mocked(getOrgId);
const mockGetQuote = vi.mocked(getQuote);
const mockSaveQuote = vi.mocked(saveQuote);
const mockDeleteQuote = vi.mocked(deleteQuote);
const mockRotate = vi.mocked(rotateApprovalToken);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown, method = "PATCH"): Request {
  return new Request("http://localhost/api/quotes/1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes/[id]", () => {
  it("returns 200 with the quote", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({ id: 1 } as any);
    const res = await GET(
      // biome-ignore lint/suspicious/noExplicitAny: GET handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockGetQuote.mockResolvedValue(null);
    const res = await GET(
      // biome-ignore lint/suspicious/noExplicitAny: GET handler no-arg
      undefined as any,
      makeParams("99")
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/quotes/[id]", () => {
  it("validates status enum", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest({ status: "garbage" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );
    expect(res.status).toBe(400);
  });

  it("validates convenienceFeeRate range", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest({ convenienceFeeRate: 2 });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );
    expect(res.status).toBe(400);
  });

  it("forwards a valid patch to saveQuote", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({ id: 1, status: "draft" } as any);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSaveQuote.mockResolvedValue({ id: 1, status: "sent" } as any);
    const req = makeRequest({ status: "sent" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );
    expect(res.status).toBe(200);
    expect(mockSaveQuote).toHaveBeenCalledWith(1, "org1", { status: "sent" });
  });

  it("returns 409 when patching a locked (accepted) quote", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({ id: 1, status: "accepted" } as any);
    const req = makeRequest({ status: "sent" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );
    expect(res.status).toBe(409);
    expect(mockSaveQuote).not.toHaveBeenCalled();
  });

  it("returns 409 when patching a locked (declined) quote", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({ id: 1, status: "declined" } as any);
    const req = makeRequest({ status: "sent" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );
    expect(res.status).toBe(409);
    expect(mockSaveQuote).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/quotes/[id]", () => {
  it("returns 200 on success", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteQuote.mockResolvedValue(true);
    const res = await DELETE(
      // biome-ignore lint/suspicious/noExplicitAny: DELETE handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 when the quote has tied events", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteQuote.mockRejectedValue(new QuoteHasEventsError(2));
    const res = await DELETE(
      // biome-ignore lint/suspicious/noExplicitAny: DELETE handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: expect.stringContaining("2 scheduled job"),
    });
  });
});

describe("POST /api/quotes/[id]/approval-token", () => {
  it("returns the rotated token", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockRotate.mockResolvedValue("the-token");
    const res = await tokenPOST(
      // biome-ignore lint/suspicious/noExplicitAny: POST handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approvalToken: "the-token" });
  });

  it("returns 404 when the quote isn't found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockRotate.mockResolvedValue(null);
    const res = await tokenPOST(
      // biome-ignore lint/suspicious/noExplicitAny: POST handler no-arg
      undefined as any,
      makeParams("99")
    );
    expect(res.status).toBe(404);
  });
});
