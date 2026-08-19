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

  it("401 for non-admin", async () => {
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
    expect(res.status).toBe(401);
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

  it("409 EMAIL_TAKEN when the email already exists in the caller's own org", async () => {
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
    // The existence check must be scoped to the caller's own org (#324) —
    // never a bare global lookup by email.
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "dup@test.dev", orgId: "org1" },
      })
    );
  });

  it("does not disclose a cross-org email collision as EMAIL_TAKEN/409 (#324)", async () => {
    asRole("admin");
    // The org-scoped existence check finds nothing in the caller's org...
    mockFindFirst.mockResolvedValueOnce(null);
    // ...but the email is registered in a DIFFERENT org, so the DB's global
    // unique constraint rejects the insert. The response must not be the
    // distinguishable EMAIL_TAKEN/409 an admin could use as an oracle for
    // "this email exists somewhere on the platform".
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    mockCreate.mockRejectedValueOnce(p2002);

    const res = await POST(
      makePost({
        name: "Jane",
        email: "other-org@test.dev",
        role: "crew",
        password: "abcd1234",
      }),
      noParams
    );

    expect(res.status).not.toBe(409);
    const body = await res.json();
    expect(body.error.code).not.toBe("EMAIL_TAKEN");
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
  });

  it("400 on bad payload (invalid role, short password, bad email)", async () => {
    asRole("admin");
    const res = await POST(
      makePost({ name: "", email: "bad", role: "owner", password: "x" }),
      noParams
    );
    expect(res.status).toBe(400);
  });
});
