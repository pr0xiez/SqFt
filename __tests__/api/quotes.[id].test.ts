import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteHasEventsError, QuoteLockedError } from "@/lib/api/errors";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  getQuote: vi.fn(),
  saveQuote: vi.fn(),
  deleteQuote: vi.fn(),
  rotateApprovalToken: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getQuote, saveQuote, deleteQuote, rotateApprovalToken } = await import(
  "@/lib/repositories"
);
const { GET, PATCH, DELETE } = await import("@/app/api/quotes/[id]/route");
const { POST: tokenPOST } = await import(
  "@/app/api/quotes/[id]/approval-token/route"
);

const mockGetQuote = vi.mocked(getQuote);
const mockSaveQuote = vi.mocked(saveQuote);
const mockDeleteQuote = vi.mocked(deleteQuote);
const mockRotate = vi.mocked(rotateApprovalToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/quotes/[id]", () => {
  it("returns the quote", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({ id: 1 } as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/quotes/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockGetQuote).toHaveBeenCalledWith(1, "org1");
  });

  it("returns NOT_FOUND when not found", async () => {
    mockGetQuote.mockResolvedValue(null);
    const res = await GET(
      makeRequest("GET", "http://x/api/quotes/99"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/quotes/[id]", () => {
  it("forwards a valid patch to saveQuote", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSaveQuote.mockResolvedValue({ id: 1, status: "sent" } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/quotes/1", { status: "sent" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockSaveQuote).toHaveBeenCalledWith(1, "org1", { status: "sent" });
  });

  it("rejects an invalid status enum with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/quotes/1", { status: "garbage" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects convenienceFeeRate out of range with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/quotes/1", {
        convenienceFeeRate: 2,
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
  });

  it("maps QuoteLockedError thrown by saveQuote to QUOTE_LOCKED", async () => {
    mockSaveQuote.mockRejectedValue(new QuoteLockedError("accepted"));
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/quotes/1", { status: "sent" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("QUOTE_LOCKED");
  });

  it("returns NOT_FOUND when saveQuote returns null", async () => {
    mockSaveQuote.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/quotes/99", { status: "sent" }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/quotes/[id]", () => {
  it("returns 204 on success", async () => {
    mockDeleteQuote.mockResolvedValue(true);
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/quotes/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(204);
  });

  it("maps QuoteHasEventsError to QUOTE_HAS_EVENTS 409", async () => {
    mockDeleteQuote.mockRejectedValue(new QuoteHasEventsError(2));
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/quotes/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("QUOTE_HAS_EVENTS");
    expect(body.error.message).toContain("2");
  });
});

describe("POST /api/quotes/[id]/approval-token", () => {
  it("returns the rotated token", async () => {
    mockRotate.mockResolvedValue("the-token");
    const res = await tokenPOST(
      makeRequest("POST", "http://x/api/quotes/1/approval-token"),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approvalToken: "the-token" });
  });

  it("returns NOT_FOUND when the quote isn't there", async () => {
    mockRotate.mockResolvedValue(null);
    const res = await tokenPOST(
      makeRequest("POST", "http://x/api/quotes/99/approval-token"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});
