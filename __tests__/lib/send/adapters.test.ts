import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSnapshot } from "@/lib/invoices/types";

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/repositories", () => ({
  getEstimateForSend: vi.fn(),
  getOrgSendInfo: vi.fn(async () => ({
    name: "Acme",
    phone: null,
    logo: null,
  })),
  rotateApprovalToken: vi.fn(),
  markEstimateSent: vi.fn(async () => true),
  writeEstimateEvent: vi.fn(),
  updateCustomerEmail: vi.fn(async () => true),
  getInvoiceForSend: vi.fn(),
  rotateInvoiceToken: vi.fn(),
  markInvoiceSent: vi.fn(async () => true),
  writeInvoiceEvent: vi.fn(),
}));
vi.mock("@/lib/email/sendEstimateEmail", () => ({
  sendEstimateEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/email/sendInvoiceEmail", () => ({
  sendInvoiceEmail: vi.fn(async () => ({ ok: true })),
}));

const repos = await import("@/lib/repositories");
const { sendEstimateEmail } = await import("@/lib/email/sendEstimateEmail");
const { sendInvoiceEmail } = await import("@/lib/email/sendInvoiceEmail");
const { sendEstimate } = await import("@/lib/send/sendEstimate");
const { sendInvoice } = await import("@/lib/send/sendInvoice");

const req = {
  to: "c@example.com",
  subject: "Hello",
  sender: { email: "lead@org.com", name: "Lead" },
};

const unresolvedLine = {
  id: 1,
  name: "LVP",
  description: null,
  rate: 5,
  qtyMode: "linked_area",
  qty: null,
  wastePct: 0,
  unitLabel: "ft²",
  linkedRoomIds: [999], // room no longer exists
  sortOrder: 0,
};

function estimateFixture(lineItems: unknown[]) {
  return {
    id: 1,
    orgId: "org1",
    status: "draft",
    approvalToken: "tok",
    estimateNumber: 5001,
    markupPct: 0,
    depositPct: 0.5,
    terms: "",
    paymentInstructions: "",
    lineItems,
    siteMeasure: {
      items: [],
      location: {
        address: "1 Main",
        customer: {
          id: 5,
          name: "Janet",
          email: "c@example.com",
          phone: null,
        },
      },
    },
  };
}

function invoiceFixture(lineItems: unknown[], amount: number) {
  return {
    id: 9,
    invoiceNumber: 7001,
    status: "draft",
    amount,
    pct: null,
    memo: "",
    terms: "",
    coverNote: "",
    paymentInstructions: "",
    date: new Date("2026-06-01T00:00:00Z"),
    dueDate: null,
    publicToken: "tok",
    stripePaymentLinkUrl: null,
    estimate: estimateFixture(lineItems),
    org: {
      name: "Acme",
      phone: null,
      address: null,
      licenseNumber: null,
      logo: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.sqft.dev";
});

describe("sendEstimate adapter prepare()", () => {
  it("emails a $0 total when every line is unresolved (pinned current behavior)", async () => {
    vi.mocked(repos.getEstimateForSend).mockResolvedValue(
      estimateFixture([unresolvedLine]) as never
    );
    await sendEstimate(1, "org1", req);
    expect(sendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        totalDollars: 0,
        publicUrl: "https://app.sqft.dev/estimate-review/tok",
      })
    );
    expect(repos.markEstimateSent).toHaveBeenCalledTimes(1);
  });

  it("emails only the resolved lines' total when some lines are unresolved", async () => {
    const manual = { ...unresolvedLine, id: 2, qtyMode: "manual", qty: 10 };
    vi.mocked(repos.getEstimateForSend).mockResolvedValue(
      estimateFixture([unresolvedLine, manual]) as never
    );
    await sendEstimate(1, "org1", req);
    expect(sendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ totalDollars: 50 })
    );
  });

  it("emails $0 for an estimate with no line items", async () => {
    vi.mocked(repos.getEstimateForSend).mockResolvedValue(
      estimateFixture([]) as never
    );
    await sendEstimate(1, "org1", req);
    expect(sendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ totalDollars: 0 })
    );
  });
});

describe("sendInvoice adapter prepare()", () => {
  it("freezes empty lines with a non-zero balanceDue when every line is unresolved (pinned current behavior)", async () => {
    vi.mocked(repos.getInvoiceForSend).mockResolvedValue(
      invoiceFixture([unresolvedLine], 250) as never
    );
    await sendInvoice(9, "org1", req);
    const snapshot = vi.mocked(repos.markInvoiceSent).mock.calls[0][2]
      .snapshot as unknown as InvoiceSnapshot;
    expect(snapshot.lines).toEqual([]);
    expect(snapshot.totals).toEqual({
      subtotal: 0,
      markup: 0,
      balanceDue: 250,
    });
    expect(sendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({ amountDollars: 250 })
    );
  });

  it("pins the snapshot shape for a zero-amount invoice on resolved lines", async () => {
    const manual = { ...unresolvedLine, qtyMode: "manual", qty: 10 };
    vi.mocked(repos.getInvoiceForSend).mockResolvedValue(
      invoiceFixture([manual], 0) as never
    );
    await sendInvoice(9, "org1", req);
    const snapshot = vi.mocked(repos.markInvoiceSent).mock.calls[0][2]
      .snapshot as unknown as InvoiceSnapshot;
    expect(snapshot.totals.balanceDue).toBe(0);
    expect(snapshot.totals.subtotal).toBe(50);
    expect(snapshot.lines.every((l) => l.amount === 0)).toBe(true);
  });
});
