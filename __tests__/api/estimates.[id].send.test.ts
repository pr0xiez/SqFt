import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  getEstimate: vi.fn(),
  rotateApprovalToken: vi.fn(),
  markEstimateSent: vi.fn(),
  writeEstimateEvent: vi.fn(),
  updateCustomerEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/email/sendEstimateEmail", () => ({
  sendEstimateEmail: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logRequest: vi.fn(),
  logMutation: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        name: "Acme Flooring",
        phone: "555-1212",
        logo: null,
      }),
    },
  },
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const {
  getEstimate,
  rotateApprovalToken,
  markEstimateSent,
  writeEstimateEvent,
  updateCustomerEmail,
} = await import("@/lib/repositories");
const { requireSession } = await import("@/lib/tenant");
const { sendEstimateEmail } = await import("@/lib/email/sendEstimateEmail");
const { logError } = await import("@/lib/logger");
const { POST } = await import("@/app/api/estimates/[id]/send/route");

const mockGetEstimate = vi.mocked(getEstimate);
const mockRotate = vi.mocked(rotateApprovalToken);
const mockMarkSent = vi.mocked(markEstimateSent);
const mockWriteEvent = vi.mocked(writeEstimateEvent);
const mockUpdateCustomerEmail = vi.mocked(updateCustomerEmail);
const mockRequireSession = vi.mocked(requireSession);
const mockSendEstimateEmail = vi.mocked(sendEstimateEmail);
const mockLogError = vi.mocked(logError);

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

describe("POST /api/estimates/[id]/send", () => {
  it("sends a fresh email when the estimate already has a token", async () => {
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "token-xyz",
      estimateNumber: 5001,
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
      siteMeasure: {
        items: [],
        location: {
          customer: { name: "Janet", email: "henderson@example.com" },
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: partial test fixture
    } as any);
    mockSendEstimateEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", validBody),
      params({ id: "1" })
    );

    expect(res.status).toBe(200);
    expect(mockRotate).not.toHaveBeenCalled();
    expect(mockSendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "henderson@example.com",
        subject: "Q5001",
        replyTo: "alex@org.com",
        publicUrl: "https://app.sqft.dev/estimate-review/token-xyz",
      })
    );
    expect(mockMarkSent).toHaveBeenCalledWith(1, "org1", expect.any(Object));
  });

  it("rotates the token when none exists and logs link_rotated", async () => {
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: null,
      estimateNumber: 5001,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      siteMeasure: {
        items: [],
        location: { customer: { name: "X", email: "x@x.com" } },
      },
      // biome-ignore lint/suspicious/noExplicitAny: partial test fixture
    } as any);
    mockRotate.mockResolvedValue("new-token-aaa");
    mockSendEstimateEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", {
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
    expect(mockSendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        publicUrl: "https://app.sqft.dev/estimate-review/new-token-aaa",
      })
    );
  });

  it("returns ESTIMATE_LOCKED when the estimate is already approved", async () => {
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "approved",
      approvalToken: "t",
    } as never);
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ESTIMATE_LOCKED");
    expect(mockSendEstimateEmail).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the estimate isn't in the org", async () => {
    mockGetEstimate.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/99/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });

  it("returns VALIDATION_FAILED on invalid email", async () => {
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", {
        to: "not-an-email",
        subject: "x",
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
  });

  it("returns EMAIL_FAILED (502) and does not mark sent when send fails", async () => {
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "t",
      estimateNumber: 5001,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      siteMeasure: {
        items: [],
        location: { customer: { name: "X", email: "x@x.com" } },
      },
    } as never);
    mockSendEstimateEmail.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", {
        to: "x@x.com",
        subject: "x",
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("EMAIL_FAILED");
    expect(mockMarkSent).not.toHaveBeenCalled();
  });

  it("persists the send-to address onto the customer and reports customerEmailSaved: true", async () => {
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "t",
      estimateNumber: 5001,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      siteMeasure: {
        items: [],
        location: {
          customer: { id: 42, name: "Janet", email: "old@example.com" },
        },
      },
    } as never);
    mockSendEstimateEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);
    mockUpdateCustomerEmail.mockResolvedValueOnce(true);

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", {
        to: "new@example.com",
        subject: "x",
      }),
      params({ id: "1" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, customerEmailSaved: true });
    expect(mockUpdateCustomerEmail).toHaveBeenCalledWith(
      42,
      "org1",
      "new@example.com"
    );
  });

  it("still returns ok when the customer-email save fails, with customerEmailSaved: false", async () => {
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "t",
      estimateNumber: 5001,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      siteMeasure: {
        items: [],
        location: {
          customer: { id: 42, name: "Janet", email: "old@example.com" },
        },
      },
    } as never);
    mockSendEstimateEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);
    mockUpdateCustomerEmail.mockRejectedValueOnce(new Error("db down"));

    const res = await POST(
      makeRequest("POST", "http://x/api/estimates/1/send", {
        to: "new@example.com",
        subject: "x",
      }),
      params({ id: "1" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, customerEmailSaved: false });
    expect(mockSendEstimateEmail).toHaveBeenCalled();
    expect(mockMarkSent).toHaveBeenCalledWith(1, "org1", expect.any(Object));
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "Failed to save customer email" })
    );
  });
});
