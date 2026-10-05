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
import { GET, POST } from "@/app/api/users/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindMany = vi.mocked(prisma.user.findMany);
const mockFindFirst = vi.mocked(prisma.user.findFirst);
const mockCreate = vi.mocked(prisma.user.create);

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

  it("403 for non-admin (lead)", async () => {
    asRole("lead");
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
  });

  it("403 for non-admin (crew)", async () => {
    asRole("crew");
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
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

describe("POST /api/users", () => {
  function makePost(body: unknown) {
    const req = new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    Object.defineProperty(req, "nextUrl", {
      value: new URL("http://localhost/api/users"),
      writable: false,
    });
    // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
    return req as any as NextRequest;
  }

  it("403 for non-admin", async () => {
    asRole("lead");
    const res = await POST(
      makePost({
        name: "Jane",
        email: "jane@test.dev",
        role: "crew",
        password: "abcd1234",
      }),
      noParams
    );
    expect(res.status).toBe(403);
  });

  it("201 creates a user; lowercases email; password is hashed and not returned", async () => {
    asRole("admin");
    mockFindFirst.mockResolvedValueOnce(null);
    const created = {
      id: "new1",
      name: "Jane",
      email: "jane@test.dev",
      role: "crew",
      createdAt: new Date(),
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValueOnce(created as any);

    const res = await POST(
      makePost({
        name: "Jane",
        email: "JANE@TEST.DEV",
        role: "crew",
        password: "abcd1234",
      }),
      noParams
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "new1",
      email: "jane@test.dev",
      role: "crew",
    });
    expect(body.password).toBeUndefined();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0]?.[0] as {
      data: { email: string; password: string; orgId: string; role: string };
    };
    expect(callArg.data.email).toBe("jane@test.dev");
    expect(callArg.data.orgId).toBe("org1");
    expect(callArg.data.role).toBe("crew");
    expect(callArg.data.password).not.toBe("abcd1234");
    expect(callArg.data.password.startsWith("$2")).toBe(true); // bcrypt signature
  });

  it("409 EMAIL_TAKEN when the email already exists", async () => {
    asRole("admin");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindFirst.mockResolvedValueOnce({ id: "existing" } as any);

    const res = await POST(
      makePost({
        name: "Jane",
        email: "dup@test.dev",
        role: "crew",
        password: "abcd1234",
      }),
      noParams
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMAIL_TAKEN");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "dup@test.dev", orgId: "org1" },
      })
    );
  });

  it("400 on bad payload (invalid role, short password, bad email)", async () => {
    asRole("admin");
    const res = await POST(
      makePost({ name: "", email: "bad", role: "owner", password: "x" }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  // Issue #230: the pre-flight findByEmail check above is racy under
  // concurrency — two requests can both pass it and race to insert, and the
  // loser hits the User.email unique index (Prisma P2002). Simulate that
  // race directly (no real DB concurrency) by having the pre-flight check
  // pass but the create call reject with P2002, and assert it still comes
  // back as 409 EMAIL_TAKEN rather than a 500.
  it("generic 400 (not EMAIL_TAKEN) when the email belongs to another org (P2002)", async () => {
    asRole("admin");
    mockFindFirst.mockResolvedValueOnce(null);
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    mockCreate.mockRejectedValueOnce(p2002);

    const res = await POST(
      makePost({
        name: "Jane",
        email: "race@test.dev",
        role: "crew",
        password: "abcd1234",
      }),
      noParams
    );

    // Issue #324: a collision with another org must not be an oracle.
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(body)).not.toMatch(/EMAIL_TAKEN|already/i);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
