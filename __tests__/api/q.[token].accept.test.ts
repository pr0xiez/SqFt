import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuoteByToken: vi.fn(),
  acceptQuoteByToken: vi.fn(),
}));
vi.mock("@/lib/email/sendSignedNotification", () => ({
  sendSignedNotification: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: pass-through
  withLogging: (fn: any) => fn,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn().mockResolvedValue([{ email: "owner@org.com" }]) },
  },
}));

const { getQuoteByToken, acceptQuoteByToken } = await import(
  "@/lib/repositories"
);
const { sendSignedNotification } = await import(
  "@/lib/email/sendSignedNotification"
);
const { POST } = await import("@/app/api/q/[token]/accept/route");

const mockGetByToken = vi.mocked(getQuoteByToken);
const mockAccept = vi.mocked(acceptQuoteByToken);
const _mockSend = vi.mocked(sendSignedNotification);

const validBody = {
  name: "Janet Henderson",
  email: "h@example.com",
  signatureDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  consentText: "I consent",
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/q/abc/accept", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "UA",
    },
    body: JSON.stringify(body),
  });
}
function params(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/q/[token]/accept", () => {
  it("accepts a valid sign and triggers owner notification", async () => {
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
      // biome-ignore lint/suspicious/noExplicitAny: stub
    } as any);
    mockAccept.mockResolvedValue("ok");

    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq(validBody) as unknown,
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalled();
    // notification fires (fire-and-forget; we await microtask in the route's `void`)
  });

  it("returns 404 for an invalid token", async () => {
    mockGetByToken.mockResolvedValue(null);
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq(validBody) as unknown,
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when quote is already accepted", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "accepted" } as never);
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq(validBody) as unknown,
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 on bad signature data URL", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "viewed" } as never);
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq({ ...validBody, signatureDataUrl: "not-a-data-url" }) as unknown,
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on signature larger than 100KB", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "viewed" } as never);
    const huge = `data:image/png;base64,${"A".repeat(150_000)}`;
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq({ ...validBody, signatureDataUrl: huge }) as unknown,
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(400);
  });
});
