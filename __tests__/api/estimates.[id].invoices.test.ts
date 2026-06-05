import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({
    user: { orgId: "org_1", email: "a@b.c", name: "A", role: "lead" },
  })),
}));
vi.mock("@/lib/repositories", () => ({
  createInvoice: vi.fn(async () => ({ id: 9, invoiceNumber: 1, amount: 500 })),
  listInvoicesForEstimate: vi.fn(async () => [{ id: 9 }]),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { GET, POST } from "@/app/api/estimates/[id]/invoices/route";
import { createInvoice } from "@/lib/repositories";

const ctx = params({ id: "3" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/estimates/[id]/invoices", () => {
  it("creates an invoice for the estimate", async () => {
    const res = await POST(
      makeRequest("POST", "http://t/api/estimates/3/invoices", { pct: 0.5 }),
      ctx
    );
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({ estimateId: 3, pct: 0.5 })
    );
  });
  it("returns 404 when the estimate is not found", async () => {
    vi.mocked(createInvoice).mockResolvedValueOnce(null as never);
    const res = await POST(
      makeRequest("POST", "http://t/api/estimates/3/invoices", { amount: 100 }),
      ctx
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/estimates/[id]/invoices", () => {
  it("lists invoices", async () => {
    const res = await GET(
      makeRequest("GET", "http://t/api/estimates/3/invoices"),
      ctx
    );
    expect(res.status).toBe(200);
  });
});
