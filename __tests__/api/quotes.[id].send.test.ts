import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuote: vi.fn(),
  rotateApprovalToken: vi.fn(),
  markQuoteSent: vi.fn(),
  writeQuoteEvent: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email/sendQuoteEmail", () => ({ sendQuoteEmail: vi.fn() }));
vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: pass-through
  withLogging: (fn: any) => fn,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        name: "Acme Flooring",
        phone: "555-1212",
        logo: null,
      }),
    },
    customer: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

const { getQuote, rotateApprovalToken, markQuoteSent, writeQuoteEvent } =
  await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { auth } = await import("@/lib/auth");
const { sendQuoteEmail } = await import("@/lib/email/sendQuoteEmail");
const { POST } = await import("@/app/api/quotes/[id]/send/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockGetQuote = vi.mocked(getQuote);
const mockRotate = vi.mocked(rotateApprovalToken);
const mockMarkSent = vi.mocked(markQuoteSent);
const mockWriteEvent = vi.mocked(writeQuoteEvent);
const mockAuth = vi.mocked(auth);
const mockSendQuoteEmail = vi.mocked(sendQuoteEmail);

function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/quotes/1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.sqft.dev";
});

describe("POST /api/quotes/[id]/send", () => {
  it("sends a fresh email when the quote already has a token", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({
      user: { email: "alex@org.com", name: "Alex" },
    } as never);
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "token-xyz",
      quoteNumber: 5001,
      taxRate: 0.08,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [
        {
          id: 1,
          name: "LVP",
          rate: 4.85,
          qtyMode: "manual",
          qty: 100,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
      estimate: {
        items: [],
        customer: { name: "Janet", email: "henderson@example.com" },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test fixture
    } as any);
    mockSendQuoteEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeReq({ to: "henderson@example.com", subject: "Q5001" }),
      params("1")
    );

    expect(res.status).toBe(200);
    expect(mockRotate).not.toHaveBeenCalled();
    expect(mockSendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "henderson@example.com",
        subject: "Q5001",
        replyTo: "alex@org.com",
        publicUrl: "https://app.sqft.dev/q/token-xyz",
      })
    );
    expect(mockMarkSent).toHaveBeenCalledWith(1, "org1", expect.any(Object));
  });

  it("rotates the token when none exists and logs link_rotated", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({
      user: { email: "alex@org.com", name: "Alex" },
    } as never);
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: null,
      quoteNumber: 5001,
      taxRate: 0.08,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      estimate: { items: [], customer: { name: "X", email: "x@x.com" } },
      // biome-ignore lint/suspicious/noExplicitAny: test fixture
    } as any);
    mockRotate.mockResolvedValue("new-token-aaa");
    mockSendQuoteEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeReq({ to: "x@x.com", subject: "x" }),
      params("1")
    );
    expect(res.status).toBe(200);
    expect(mockRotate).toHaveBeenCalledWith(1, "org1");
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "link_rotated",
        actorEmail: "alex@org.com",
      })
    );
    expect(mockSendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        publicUrl: "https://app.sqft.dev/q/new-token-aaa",
      })
    );
  });

  it("returns 409 when the quote is already accepted", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({
      user: { email: "alex@org.com", name: "Alex" },
    } as never);
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "accepted",
      approvalToken: "t",
    } as never);
    const res = await POST(
      makeReq({ to: "x@x.com", subject: "x" }),
      params("1")
    );
    expect(res.status).toBe(409);
    expect(mockSendQuoteEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the quote isn't in the org", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({
      user: { email: "alex@org.com", name: "Alex" },
    } as never);
    mockGetQuote.mockResolvedValue(null);
    const res = await POST(
      makeReq({ to: "x@x.com", subject: "x" }),
      params("99")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid email", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({
      user: { email: "alex@org.com", name: "Alex" },
    } as never);
    const res = await POST(
      makeReq({ to: "not-an-email", subject: "x" }),
      params("1")
    );
    expect(res.status).toBe(400);
  });

  it("does NOT mark sent when sendQuoteEmail fails", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({
      user: { email: "alex@org.com", name: "Alex" },
    } as never);
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "t",
      quoteNumber: 5001,
      taxRate: 0.08,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      estimate: { items: [], customer: { name: "X", email: "x@x.com" } },
    } as never);
    mockSendQuoteEmail.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(
      makeReq({ to: "x@x.com", subject: "x" }),
      params("1")
    );
    expect(res.status).toBe(502);
    expect(mockMarkSent).not.toHaveBeenCalled();
  });
});
