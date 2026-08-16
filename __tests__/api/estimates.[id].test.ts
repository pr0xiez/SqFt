import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateHasEventsError, EstimateLockedError } from "@/lib/api/errors";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  getEstimate: vi.fn(),
  saveEstimate: vi.fn(),
  deleteEstimate: vi.fn(),
  rotateApprovalToken: vi.fn(),
  estimateHasApprovalToken: vi.fn(),
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

const {
  getEstimate,
  saveEstimate,
  deleteEstimate,
  rotateApprovalToken,
  estimateHasApprovalToken,
} = await import("@/lib/repositories");
const { GET, PATCH, DELETE } = await import("@/app/api/estimates/[id]/route");
const { POST: tokenPOST } = await import(
  "@/app/api/estimates/[id]/approval-token/route"
);

const mockGetEstimate = vi.mocked(getEstimate);
const mockSaveEstimate = vi.mocked(saveEstimate);
const mockDeleteEstimate = vi.mocked(deleteEstimate);
const mockRotate = vi.mocked(rotateApprovalToken);
const mockHasToken = vi.mocked(estimateHasApprovalToken);

beforeEach(() => {
  vi.clearAllMocks();
  mockHasToken.mockResolvedValue(false);
});

describe("GET /api/estimates/[id]", () => {
  it("returns the estimate", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetEstimate.mockResolvedValue({ id: 1 } as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockGetEstimate).toHaveBeenCalledWith(1, "org1");
  });

  it("returns NOT_FOUND when not found", async () => {
    mockGetEstimate.mockResolvedValue(null);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates/99"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });

  it("carries only the hasApprovalToken flag, never the raw token", async () => {
    // Shape mirrors the real repo's select (no `approvalToken` key at all —
    // see ESTIMATE_DETAILS_SELECT in estimateRepo.ts).
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetEstimate.mockResolvedValue({ id: 1, status: "sent" } as any);
    mockHasToken.mockResolvedValue(true);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates/1"),
      params({ id: "1" })
    );
    const body = await res.json();
    expect(body).not.toHaveProperty("approvalToken");
    expect(body.hasApprovalToken).toBe(true);
  });
});

describe("PATCH /api/estimates/[id]", () => {
  it("forwards a valid patch to saveEstimate", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSaveEstimate.mockResolvedValue({ id: 1, status: "sent" } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/1", { status: "sent" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockSaveEstimate).toHaveBeenCalledWith(1, "org1", {
      status: "sent",
    });
  });

  it("rejects an invalid status enum with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/1", { status: "garbage" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects depositPct out of range with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/1", {
        depositPct: 2,
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
  });

  it("maps EstimateLockedError thrown by saveEstimate to ESTIMATE_LOCKED", async () => {
    mockSaveEstimate.mockRejectedValue(new EstimateLockedError("approved"));
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/1", { status: "sent" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ESTIMATE_LOCKED");
  });

  it("returns NOT_FOUND when saveEstimate returns null", async () => {
    mockSaveEstimate.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/99", { status: "sent" }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/estimates/[id]", () => {
  it("returns 204 on success", async () => {
    mockDeleteEstimate.mockResolvedValue(true);
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/estimates/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(204);
  });

  it("maps EstimateHasEventsError to ESTIMATE_HAS_EVENTS 409", async () => {
    mockDeleteEstimate.mockRejectedValue(new EstimateHasEventsError(2));
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/estimates/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ESTIMATE_HAS_EVENTS");
    expect(body.error.message).toContain("2");
  });
});

describe("POST /api/estimates/[id]/approval-token", () => {
  it("returns the rotated token", async () => {
    mockRotate.mockResolvedValue("the-token");
    const res = await tokenPOST(
      makeRequest("POST", "http://x/api/estimates/1/approval-token"),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approvalToken: "the-token" });
  });

  it("returns NOT_FOUND when the estimate isn't there", async () => {
    mockRotate.mockResolvedValue(null);
    const res = await tokenPOST(
      makeRequest("POST", "http://x/api/estimates/99/approval-token"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});
