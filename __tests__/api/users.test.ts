import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET } from "@/app/api/users/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindMany = vi.mocked(prisma.user.findMany);

function makeRequest(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request("http://localhost/api/users", init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/users"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}
const noParams = { params: Promise.resolve({}) };

function asRole(
  role: "admin" | "lead" | "crew",
  userId = "u1",
  orgId = "org1"
) {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: userId, orgId, role } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/users", () => {
  it("401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("401 for non-admin (lead)", async () => {
    asRole("lead");
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("401 for non-admin (crew)", async () => {
    asRole("crew");
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("returns users in the org for admin", async () => {
    asRole("admin");
    const stub = [
      {
        id: "u1",
        name: "A",
        email: "a@x.dev",
        role: "admin",
        createdAt: new Date(),
      },
      {
        id: "u2",
        name: "B",
        email: "b@x.dev",
        role: "crew",
        createdAt: new Date(),
      },
    ];
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindMany.mockResolvedValueOnce(stub as any);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ id: "u1", role: "admin" });
    expect(body[0].password).toBeUndefined();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { createdAt: "asc" },
      })
    );
  });
});
