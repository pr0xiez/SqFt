import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockRejectedValue(new Error("public")),
}));
vi.mock("@/lib/repositories", () => ({
  getEstimateByToken: vi.fn(),
  approveEstimateByToken: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getEstimateByToken, approveEstimateByToken } = await import(
  "@/lib/repositories"
);
const { POST } = await import(
  "@/app/api/estimate-review/[token]/approve/route"
);

const mockGetByToken = vi.mocked(getEstimateByToken);
const mockApprove = vi.mocked(approveEstimateByToken);

const validToken = "seed-token-1234567890";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/estimate-review/[token]/approve", () => {
  it("approves with no body", async () => {
    mockGetByToken.mockResolvedValue({
      id: 1,
      orgId: "org1",
      estimateNumber: 5001,
      status: "viewed",
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      date: new Date(),
      siteMeasure: {
        location: {
          address: null,
          customer: {
            name: "Janet",
            email: "h@example.com",
            phone: null,
          },
        },
        items: [],
      },
      org: {
        name: "Acme",
        address: null,
        phone: null,
        licenseNumber: null,
        logo: null,
      },
      // biome-ignore lint/suspicious/noExplicitAny: partial test fixture
    } as any);
    mockApprove.mockResolvedValue("ok");

    const res = await POST(
      makeRequest("POST", `http://x/api/estimate-review/${validToken}/approve`),
      params({ token: validToken })
    );
    expect(res.status).toBe(200);
    expect(mockApprove).toHaveBeenCalled();
  });

  it("records the platform-verified IP, ignoring a spoofed x-forwarded-for", async () => {
    mockGetByToken.mockResolvedValue({
      id: 1,
      orgId: "org1",
      estimateNumber: 5001,
      status: "viewed",
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      date: new Date(),
      siteMeasure: {
        location: {
          address: null,
          customer: {
            name: "Janet",
            email: "h@example.com",
            phone: null,
          },
        },
        items: [],
      },
      org: {
        name: "Acme",
        address: null,
        phone: null,
        licenseNumber: null,
        logo: null,
      },
      // biome-ignore lint/suspicious/noExplicitAny: partial test fixture
    } as any);
    mockApprove.mockResolvedValue("ok");

    const res = await POST(
      makeRequest(
        "POST",
        `http://x/api/estimate-review/${validToken}/approve`,
        undefined,
        {
          "x-forwarded-for": "6.6.6.6",
          "x-vercel-forwarded-for": "203.0.113.9",
        }
      ),
      params({ token: validToken })
    );
    expect(res.status).toBe(200);
    expect(mockApprove).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "203.0.113.9" })
    );
  });

  it("returns NOT_FOUND for an unknown token", async () => {
    mockGetByToken.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", `http://x/api/estimate-review/${validToken}/approve`),
      params({ token: validToken })
    );
    expect(res.status).toBe(404);
  });

  it("returns CONFLICT when the estimate is already approved", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "approved" } as never);
    const res = await POST(
      makeRequest("POST", `http://x/api/estimate-review/${validToken}/approve`),
      params({ token: validToken })
    );
    expect(res.status).toBe(409);
  });
});
