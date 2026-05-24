import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  getQuote: vi.fn(),
  rotateApprovalToken: vi.fn(),
  markQuoteSent: vi.fn(),
  writeQuoteEvent: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/email/sendQuoteEmail", () => ({ sendQuoteEmail: vi.fn() }));
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
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { getQuote, rotateApprovalToken, markQuoteSent, writeQuoteEvent } =
  await import("@/lib/repositories");
const { requireSession } = await import("@/lib/tenant");
const { sendQuoteEmail } = await import("@/lib/email/sendQuoteEmail");
const { POST } = await import("@/app/api/quotes/[id]/send/route");

const mockGetQuote = vi.mocked(getQuote);
const mockRotate = vi.mocked(rotateApprovalToken);
const mockMarkSent = vi.mocked(markQuoteSent);
const mockWriteEvent = vi.mocked(writeQuoteEvent);
const mockRequireSession = vi.mocked(requireSession);
const mockSendQuoteEmail = vi.mocked(sendQuoteEmail);

const validBody = { to: "henderson@example.com", subject: "Q5001" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.sqft.dev";
  mockRequireSession.mockResolvedValue({
    user: {
      id: "u1",
      orgId: "org1",
      role: "lead",
      email: "alex@org.com",
      name: "Alex",
    },
  } as never);
});

describe("POST /api/quotes/[id]/send", () => {
  it("sends a fresh email when the quote already has a token", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "token-xyz",
      quoteNumber: 5001,
      convenienceFeeRate: 0.03,
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
      // biome-ignore lint/suspicious/noExplicitAny: partial test fixture
    } as any);
    mockSendQuoteEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeRequest("POST", "http://x/api/quotes/1/send", validBody),
      params({ id: "1" })
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
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: null,
      quoteNumber: 5001,
      convenienceFeeRate: 0.03,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      estimate: { items: [], customer: { name: "X", email: "x@x.com" } },
      // biome-ignore lint/suspicious/noExplicitAny: partial test fixture
    } as any);
    mockRotate.mockResolvedValue("new-token-aaa");
    mockSendQuoteEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeRequest("POST", "http://x/api/quotes/1/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "1" })
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

  it("returns CONFLICT when the quote is already accepted", async () => {
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "accepted",
      approvalToken: "t",
    } as never);
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes/1/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(409);
    expect(mockSendQuoteEmail).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the quote isn't in the org", async () => {
    mockGetQuote.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes/99/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });

  it("returns VALIDATION_FAILED on invalid email", async () => {
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes/1/send", {
        to: "not-an-email",
        subject: "x",
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
  });

  it("returns EMAIL_FAILED (502) and does not mark sent when send fails", async () => {
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "t",
      quoteNumber: 5001,
      convenienceFeeRate: 0.03,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      estimate: { items: [], customer: { name: "X", email: "x@x.com" } },
    } as never);
    mockSendQuoteEmail.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(
      makeRequest("POST", "http://x/api/quotes/1/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("EMAIL_FAILED");
    expect(mockMarkSent).not.toHaveBeenCalled();
  });
});
