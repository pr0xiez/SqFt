import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockRejectedValue(new Error("public")),
}));
vi.mock("@/lib/repositories", () => ({
  getEstimateByToken: vi.fn(),
  declineEstimateByToken: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getEstimateByToken, declineEstimateByToken } = await import(
  "@/lib/repositories"
);
const { POST } = await import("@/app/api/q/[token]/decline/route");

const validToken = "seed-token-1234567890";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/q/[token]/decline", () => {
  it("declines with optional reason", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue({
      id: 1,
      status: "viewed",
      orgId: "o",
      estimateNumber: 1,
      siteMeasure: { customer: { name: "C", email: "c@x.com" } },
    } as never);
    vi.mocked(declineEstimateByToken).mockResolvedValue("ok");
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/decline`, {
        reason: "too expensive",
      }),
      params({ token: validToken })
    );
    expect(res.status).toBe(200);
  });

  it("accepts an empty body", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue({
      id: 1,
      status: "viewed",
      orgId: "o",
      estimateNumber: 1,
      siteMeasure: { customer: { name: "C", email: "c@x.com" } },
    } as never);
    vi.mocked(declineEstimateByToken).mockResolvedValue("ok");
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/decline`, {}),
      params({ token: validToken })
    );
    expect(res.status).toBe(200);
  });

  it("returns CONFLICT when already accepted", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue({
      id: 1,
      status: "accepted",
    } as never);
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/decline`, {}),
      params({ token: validToken })
    );
    expect(res.status).toBe(409);
  });

  it("returns NOT_FOUND on unknown token", async () => {
    vi.mocked(getEstimateByToken).mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/decline`, {}),
      params({ token: validToken })
    );
    expect(res.status).toBe(404);
  });
});
