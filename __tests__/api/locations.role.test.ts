/**
 * Role-gate tests for /api/locations: pins the `minRole: "lead"` boundary on
 * customer addresses. Mirrors __tests__/api/invoices.role.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories", () => ({
  createLocation: vi.fn(),
  listLocationsForCustomer: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/locations/route";
import { auth } from "@/lib/auth";
import { createLocation, listLocationsForCustomer } from "@/lib/repositories";

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
  const req = new Request("http://localhost/api/locations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: 1,
      street: "12 Oak St",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
    }),
  });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/locations"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listLocationsForCustomer).mockResolvedValue([]);
  vi.mocked(createLocation).mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: minimal location stub
    { id: 1 } as any
  );
});

describe("GET /api/locations — role gate", () => {
  it("401 for crew", async () => {
    asRole("crew");
    const res = await GET(
      makeGet("http://localhost/api/locations?customerId=1"),
      { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(listLocationsForCustomer).not.toHaveBeenCalled();
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await GET(
      makeGet("http://localhost/api/locations?customerId=1"),
      { params: Promise.resolve({}) }
    );
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/locations — role gate", () => {
  it("401 for crew", async () => {
    asRole("crew");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(createLocation).not.toHaveBeenCalled();
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).not.toBe(401);
  });
});
