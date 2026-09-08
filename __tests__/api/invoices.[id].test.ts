import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceOverpayError } from "@/lib/api/errors";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({
    user: { orgId: "org_1", email: "a@b.c", name: "Amy", role: "lead" },
  })),
}));
vi.mock("@/lib/repositories", () => ({
  getInvoice: vi.fn(async () => ({ id: 9, status: "draft" })),
  voidInvoice: vi.fn(async () => ({ id: 9, status: "void" })),
  recordPayment: vi.fn(async () => ({ id: 9, status: "partial" })),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { POST as PAY } from "@/app/api/invoices/[id]/payments/route";
import { GET } from "@/app/api/invoices/[id]/route";
import { POST as VOID } from "@/app/api/invoices/[id]/void/route";
import { recordPayment } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

const ctx = params({ id: "9" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invoice detail routes", () => {
  it("GET returns the invoice", async () => {
    expect(
      (await GET(makeRequest("GET", "http://t/api/invoices/9"), ctx)).status
    ).toBe(200);
  });
  it("void marks the invoice void", async () => {
    expect(
      (await VOID(makeRequest("POST", "http://t/api/invoices/9/void"), ctx))
        .status
    ).toBe(200);
  });
  it("payments records a payment", async () => {
    const res = await PAY(
      makeRequest("POST", "http://t/api/invoices/9/payments", {
        amount: 100,
        method: "check",
      }),
      ctx
    );
    expect(res.status).toBe(201);
    expect(recordPayment).toHaveBeenCalledWith(
      9,
      "org_1",
      expect.objectContaining({
        amount: 100,
        method: "check",
        recordedByName: "Amy",
      })
    );
  });
  it("payments 401s when the session is missing a name", async () => {
    const fullSession = {
      user: { orgId: "org_1", email: "a@b.c", name: "Amy", role: "lead" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any;
    const noNameSession = {
      user: { orgId: "org_1", email: "a@b.c", name: null, role: "lead" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any;
    // First call is apiRoute's own minRole gate (needs a valid role to reach
    // the handler); second call is the route's hand-rolled actor guard,
    // which is what this test targets.
    vi.mocked(requireSession)
      .mockResolvedValueOnce(fullSession)
      .mockResolvedValueOnce(noNameSession);
    const res = await PAY(
      makeRequest("POST", "http://t/api/invoices/9/payments", {
        amount: 100,
        method: "check",
      }),
      ctx
    );
    expect(res.status).toBe(401);
    expect(recordPayment).not.toHaveBeenCalled();
  });
  it("payments 401s when the session is missing an email", async () => {
    const fullSession = {
      user: { orgId: "org_1", email: "a@b.c", name: "Amy", role: "lead" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any;
    const noEmailSession = {
      user: { orgId: "org_1", email: null, name: "Amy", role: "lead" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any;
    vi.mocked(requireSession)
      .mockResolvedValueOnce(fullSession)
      .mockResolvedValueOnce(noEmailSession);
    const res = await PAY(
      makeRequest("POST", "http://t/api/invoices/9/payments", {
        amount: 100,
        method: "check",
      }),
      ctx
    );
    expect(res.status).toBe(401);
    expect(recordPayment).not.toHaveBeenCalled();
  });
  it("payments returns 409 INVOICE_OVERPAY when the amount exceeds the outstanding balance", async () => {
    vi.mocked(recordPayment).mockRejectedValueOnce(new InvoiceOverpayError(50));

    const res = await PAY(
      makeRequest("POST", "http://t/api/invoices/9/payments", {
        amount: 100,
        method: "check",
      }),
      ctx
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("INVOICE_OVERPAY");
  });
});
