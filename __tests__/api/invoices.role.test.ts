import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories", () => ({
  getInvoice: vi.fn(),
  listInvoicesForEstimate: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET as GET_ESTIMATE_INVOICES } from "@/app/api/estimates/[id]/invoices/route";
import { GET as GET_INVOICE } from "@/app/api/invoices/[id]/route";
import { auth } from "@/lib/auth";
import { getInvoice, listInvoicesForEstimate } from "@/lib/repositories";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function asRole(role: "admin" | "lead" | "crew") {
  const stub = { user: { id: "u1", orgId: "org1", role } };
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockAuth.mockResolvedValue(stub as any);
}

function makeGet(url: string) {
  const req = new Request(url, { method: "GET" });
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInvoice).mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: minimal invoice stub
    { id: 1 } as any
  );
  vi.mocked(listInvoicesForEstimate).mockResolvedValue([]);
});

describe("GET /api/invoices/[id] — role gate", () => {
  it("401 for crew", async () => {
    asRole("crew");
    const res = await GET_INVOICE(makeGet("http://localhost/api/invoices/1"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(401);
    expect(getInvoice).not.toHaveBeenCalled();
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await GET_INVOICE(makeGet("http://localhost/api/invoices/1"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).not.toBe(401);
  });
});

describe("GET /api/estimates/[id]/invoices — role gate", () => {
  it("401 for crew", async () => {
    asRole("crew");
    const res = await GET_ESTIMATE_INVOICES(
      makeGet("http://localhost/api/estimates/1/invoices"),
      { params: Promise.resolve({ id: "1" }) }
    );
    expect(res.status).toBe(401);
    expect(listInvoicesForEstimate).not.toHaveBeenCalled();
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await GET_ESTIMATE_INVOICES(
      makeGet("http://localhost/api/estimates/1/invoices"),
      { params: Promise.resolve({ id: "1" }) }
    );
    expect(res.status).not.toBe(401);
  });
});
