import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({
    user: { orgId: "org_1", email: "doug@b.c", name: "Doug", role: "lead" },
  })),
}));
const estimate = {
  terms: "50% to schedule",
  paymentInstructions: "",
  markupPct: 0,
  convenienceFeeRate: 0,
  depositPct: 0.5,
  lineItems: [
    {
      id: 1,
      name: "Carpet",
      description: "tear out",
      rate: 307,
      qtyMode: "manual",
      qty: 1,
      wastePct: 0,
      unitLabel: "job",
      linkedRoomIds: [],
      sortOrder: 0,
    },
  ],
  siteMeasure: {
    items: [],
    location: {
      address: "3722 Amity Lane",
      customer: { id: 5, name: "Alex", email: "alex@x.com", phone: null },
    },
  },
};
vi.mock("@/lib/repositories", () => ({
  getInvoiceForSend: vi.fn(async () => ({
    id: 9,
    invoiceNumber: 7465,
    status: "draft",
    amount: 153.5,
    pct: 0.5,
    memo: "Deposit",
    terms: "50% to schedule",
    coverNote: "Your deposit invoice is attached.",
    paymentInstructions: "WARNING…",
    date: new Date("2026-06-01T00:00:00Z"),
    dueDate: new Date("2026-06-06T00:00:00Z"),
    publicToken: null,
    stripePaymentLinkUrl: null,
    estimate,
    org: {
      name: "All About Hardwood",
      phone: null,
      address: null,
      licenseNumber: null,
      logo: null,
    },
  })),
  rotateInvoiceToken: vi.fn(async () => "tok_generated_aaaaaaaaaaaaaaaaaaaa"),
  markInvoiceSent: vi.fn(async () => true),
}));
vi.mock("@/lib/email/sendInvoiceEmail", () => ({
  sendInvoiceEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { POST } from "@/app/api/invoices/[id]/send/route";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { markInvoiceSent } from "@/lib/repositories";

const ctx = params({ id: "9" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/invoices/[id]/send", () => {
  it("generates a token, emails, and stamps sent with a snapshot", async () => {
    const res = await POST(
      makeRequest("POST", "http://t/api/invoices/9/send", {
        to: "alex@x.com",
        subject: "Invoice #7465",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(sendInvoiceEmail).toHaveBeenCalled();
    expect(markInvoiceSent).toHaveBeenCalledWith(
      9,
      "org_1",
      expect.objectContaining({ snapshot: expect.any(Object) })
    );
  });
});
