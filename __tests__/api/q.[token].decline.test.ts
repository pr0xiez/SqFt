import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuoteByToken: vi.fn(),
  declineQuoteByToken: vi.fn(),
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
  prisma: { user: { findMany: vi.fn().mockResolvedValue([]) } },
}));

const { getQuoteByToken, declineQuoteByToken } = await import(
  "@/lib/repositories"
);
const { POST } = await import("@/app/api/q/[token]/decline/route");

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request("http://localhost/api/q/abc/decline", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });
}
const params = (token: string) => ({ params: Promise.resolve({ token }) });

describe("POST /api/q/[token]/decline", () => {
  it("declines with optional reason", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue({
      id: 1,
      status: "viewed",
      orgId: "o",
      quoteNumber: 1,
      estimate: { customer: { name: "C", email: "c@x.com" } },
    } as never);
    vi.mocked(declineQuoteByToken).mockResolvedValue("ok");
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq({ reason: "too expensive" }),
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(200);
  });

  it("accepts empty body", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue({
      id: 1,
      status: "viewed",
      orgId: "o",
      quoteNumber: 1,
      estimate: { customer: { name: "C", email: "c@x.com" } },
    } as never);
    vi.mocked(declineQuoteByToken).mockResolvedValue("ok");
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq({}),
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 when already accepted", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue({
      id: 1,
      status: "accepted",
    } as never);
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq({}),
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 on bad token", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue(null);
    // biome-ignore lint/suspicious/noExplicitAny: route handler test
    const res = await (POST as any)(
      makeReq({}),
      params("seed-token-1234567890")
    );
    expect(res.status).toBe(404);
  });
});
