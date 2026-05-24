import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockRejectedValue(new Error("public")),
}));
vi.mock("@/lib/repositories", () => ({
  getQuoteByToken: vi.fn(),
  acceptQuoteByToken: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getQuoteByToken, acceptQuoteByToken } = await import(
  "@/lib/repositories"
);
const { POST } = await import("@/app/api/q/[token]/accept/route");

const mockGetByToken = vi.mocked(getQuoteByToken);
const mockAccept = vi.mocked(acceptQuoteByToken);

const validBody = {
  name: "Janet Henderson",
  email: "h@example.com",
  signatureDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  consentText: "I consent",
};

const validToken = "seed-token-1234567890";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/q/[token]/accept", () => {
  it("accepts a valid sign", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetByToken.mockResolvedValue({
      id: 1,
      orgId: "org1",
      quoteNumber: 5001,
      status: "viewed",
      convenienceFeeRate: 0.03,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      date: new Date(),
      estimate: {
        customer: {
          name: "Janet",
          email: "h@example.com",
          address: null,
          phone: null,
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
    mockAccept.mockResolvedValue("ok");

    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/accept`, validBody),
      params({ token: validToken })
    );
    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unknown token", async () => {
    mockGetByToken.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/accept`, validBody),
      params({ token: validToken })
    );
    expect(res.status).toBe(404);
  });

  it("returns CONFLICT when the quote is already accepted", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "accepted" } as never);
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/accept`, validBody),
      params({ token: validToken })
    );
    expect(res.status).toBe(409);
  });

  it("returns VALIDATION_FAILED on bad signature data URL", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "viewed" } as never);
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/accept`, {
        ...validBody,
        signatureDataUrl: "not-a-data-url",
      }),
      params({ token: validToken })
    );
    expect(res.status).toBe(400);
  });

  it("returns VALIDATION_FAILED on signature larger than 100KB", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "viewed" } as never);
    const huge = `data:image/png;base64,${"A".repeat(150_000)}`;
    const res = await POST(
      makeRequest("POST", `http://x/api/q/${validToken}/accept`, {
        ...validBody,
        signatureDataUrl: huge,
      }),
      params({ token: validToken })
    );
    expect(res.status).toBe(400);
  });
});
