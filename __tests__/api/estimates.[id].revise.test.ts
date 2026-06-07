/**
 * Tier-B route test for POST /api/estimates/[id]/revise: verify it loads the
 * original, gates revision on the approved/declined status, calls
 * reviseEstimate, and maps the failure cases to the right error envelopes.
 * Auth/org scoping is exercised via the mocked @/lib/tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  getEstimate: vi.fn(),
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

const { getEstimate, reviseEstimate } = await import("@/lib/repositories");
const { POST } = await import("@/app/api/estimates/[id]/revise/route");

const mockGet = vi.mocked(getEstimate);
const mockRevise = vi.mocked(reviseEstimate);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/estimates/[id]/revise", () => {
  it("revises an approved estimate, scoped to the org, returning the new id", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue({ id: 1, status: "approved" } as any);
    mockRevise.mockResolvedValue({ id: 42 });

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/revise"),
      params({ id: "1" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 42 });
    expect(mockGet).toHaveBeenCalledWith(1, "org1");
    expect(mockRevise).toHaveBeenCalledWith(1, "org1");
  });

  it("revises a declined estimate too", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue({ id: 2, status: "declined" } as any);
    mockRevise.mockResolvedValue({ id: 43 });

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/2/revise"),
      params({ id: "2" })
    );

    expect(res.status).toBe(200);
    expect(mockRevise).toHaveBeenCalledWith(2, "org1");
  });

  it("returns NOT_FOUND when the original estimate is missing", async () => {
    mockGet.mockResolvedValue(null);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/99/revise"),
      params({ id: "99" })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(mockRevise).not.toHaveBeenCalled();
  });

  it("rejects revising a non-approved/declined estimate with CONFLICT", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue({ id: 3, status: "sent" } as any);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/3/revise"),
      params({ id: "3" })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("approved or declined");
    expect(mockRevise).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when reviseEstimate returns null (race)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue({ id: 4, status: "approved" } as any);
    mockRevise.mockResolvedValue(null);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/4/revise"),
      params({ id: "4" })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
