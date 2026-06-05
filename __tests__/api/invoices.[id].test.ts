import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({
    user: { orgId: "org_1", email: "a@b.c", name: "Amy", role: "lead" },
  })),
}));
vi.mock("@/lib/repositories", () => ({
  getInvoice: vi.fn(async () => ({ id: 9, status: "draft" })),
  updateInvoice: vi.fn(async () => ({ id: 9, status: "draft" })),
  voidInvoice: vi.fn(async () => ({ id: 9, status: "void" })),
  recordPayment: vi.fn(async () => ({ id: 9, status: "partial" })),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { GET, PATCH } from "@/app/api/invoices/[id]/route";
import { POST as PAY } from "@/app/api/invoices/[id]/payments/route";
import { POST as VOID } from "@/app/api/invoices/[id]/void/route";
import { recordPayment } from "@/lib/repositories";

const ctx = params({ id: "9" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invoice detail routes", () => {
  it("GET returns the invoice", async () => {
    expect(
      (await GET(makeRequest("GET", "http://t/api/invoices/9"), ctx)).status,
    ).toBe(200);
  });
  it("PATCH updates a draft", async () => {
    expect(
      (
        await PATCH(
          makeRequest("PATCH", "http://t/api/invoices/9", { memo: "Deposit" }),
          ctx,
        )
      ).status,
    ).toBe(200);
  });
  it("void marks the invoice void", async () => {
    expect(
      (await VOID(makeRequest("POST", "http://t/api/invoices/9/void"), ctx))
        .status,
    ).toBe(200);
  });
  it("payments records a payment", async () => {
    const res = await PAY(
      makeRequest("POST", "http://t/api/invoices/9/payments", {
        amount: 100,
        method: "check",
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(recordPayment).toHaveBeenCalledWith(
      9,
      "org_1",
      expect.objectContaining({
        amount: 100,
        method: "check",
        recordedByName: "Amy",
      }),
    );
  });
});
