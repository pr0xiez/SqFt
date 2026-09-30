/**
 * Role-gate tests for /api/customers: pins the `minRole: "lead"` boundary on
 * customer PII (name, email, notes). Mirrors __tests__/api/invoices.role.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories", () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/customers/route";
import { auth } from "@/lib/auth";
import { createCustomer, listCustomers } from "@/lib/repositories";

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

function makePost() {
  const req = new Request("http://localhost/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Bob", phone: "555-1234", source: "phone" }),
  });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/customers"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCustomers).mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: minimal list stub
    { items: [], total: 0, facets: {}, summary: {} } as any
  );
  vi.mocked(createCustomer).mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: minimal customer stub
    { id: 1 } as any
  );
});

describe("GET /api/customers — role gate", () => {
  it("403 for crew", async () => {
    asRole("crew");
    const res = await GET(makeGet("http://localhost/api/customers"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(listCustomers).not.toHaveBeenCalled();
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await GET(makeGet("http://localhost/api/customers"), {
      params: Promise.resolve({}),
    });
    expect(res.status).not.toBe(403);
  });
});

describe("POST /api/customers — role gate", () => {
  it("403 for crew", async () => {
    asRole("crew");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).not.toBe(403);
  });
});
