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
  invoiceHasPublicToken: vi.fn(async () => false),
  getOrCreateInvoicePublicToken: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { POST as PAY } from "@/app/api/invoices/[id]/payments/route";
import { POST as TOKEN } from "@/app/api/invoices/[id]/public-token/route";
import { GET, PATCH } from "@/app/api/invoices/[id]/route";
import { POST as VOID } from "@/app/api/invoices/[id]/void/route";
import {
  getOrCreateInvoicePublicToken,
  recordPayment,
} from "@/lib/repositories";

const mockGetOrCreateToken = vi.mocked(getOrCreateInvoicePublicToken);

const ctx = params({ id: "9" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invoice detail routes", () => {
  it("GET returns the invoice", async () => {
    const res = await GET(makeRequest("GET", "http://t/api/invoices/9"), ctx);
    expect(res.status).toBe(200);
  });
  it("GET carries only the hasPublicToken flag, never the raw token", async () => {
    const res = await GET(makeRequest("GET", "http://t/api/invoices/9"), ctx);
    const body = await res.json();
    expect(body).not.toHaveProperty("publicToken");
    expect(body.hasPublicToken).toBe(false);
  });
  it("PATCH updates a draft", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://t/api/invoices/9", { memo: "Deposit" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("publicToken");
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
});

describe("POST /api/invoices/[id]/public-token", () => {
  it("returns the existing (or freshly-minted) token", async () => {
    mockGetOrCreateToken.mockResolvedValue("the-token");
    const res = await TOKEN(
      makeRequest("POST", "http://t/api/invoices/9/public-token"),
      ctx
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicToken: "the-token" });
    expect(mockGetOrCreateToken).toHaveBeenCalledWith(9, "org_1");
  });

  it("returns NOT_FOUND when the invoice isn't there", async () => {
    mockGetOrCreateToken.mockResolvedValue(null);
    const res = await TOKEN(
      makeRequest("POST", "http://t/api/invoices/99/public-token"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});
