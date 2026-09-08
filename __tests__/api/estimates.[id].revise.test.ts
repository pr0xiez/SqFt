/**
 * Tier-B route test for POST /api/estimates/[id]/revise: verify it's a thin
 * caller of reviseEstimate and maps its results/errors to the right
 * envelopes. The approved/declined lifecycle guard itself is enforced (and
 * tested) inside reviseEstimate — see
 * __tests__/repositories/reviseEstimate.test.ts. Auth/org scoping is
 * exercised via the mocked @/lib/tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  reviseEstimate: vi.fn(),
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

const { requireSession } = await import("@/lib/tenant");
const mockRequireSession = vi.mocked(requireSession);

const { reviseEstimate } = await import("@/lib/repositories");
const { POST } = await import("@/app/api/estimates/[id]/revise/route");

const mockRevise = vi.mocked(reviseEstimate);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/estimates/[id]/revise", () => {
  it("revises an estimate, scoped to the org, returning the new id", async () => {
    mockRevise.mockResolvedValue({ id: 42 });

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/revise"),
      params({ id: "1" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 42 });
    expect(mockRevise).toHaveBeenCalledWith(1, "org1");
  });

  it("returns 401 UNAUTHORIZED when the caller's role is below lead", async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: "u1", orgId: "org1", role: "crew" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/revise"),
      params({ id: "1" })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(mockRevise).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when reviseEstimate returns null (original missing/race)", async () => {
    mockRevise.mockResolvedValue(null);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/99/revise"),
      params({ id: "99" })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("surfaces the CONFLICT error reviseEstimate throws for a non-approved/declined estimate", async () => {
    const { ConflictError } = await import("@/lib/api/errors");
    mockRevise.mockRejectedValue(
      new ConflictError("Only approved or declined estimates can be revised")
    );

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/3/revise"),
      params({ id: "3" })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("approved or declined");
  });
});
