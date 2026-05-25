import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
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
import { PATCH } from "@/app/api/users/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindFirst = vi.mocked(prisma.user.findFirst);
const mockUpdate = vi.mocked(prisma.user.update);
const mockCount = vi.mocked(prisma.user.count);

function makePatch(body: unknown) {
  const req = new Request("http://localhost/api/users/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/users/x"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

function asRole(
  role: "admin" | "lead" | "crew",
  userId = "self",
  orgId = "org1"
) {
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockAuth.mockResolvedValue({ user: { id: userId, orgId, role } } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/users/[id]", () => {
  it("401 for non-admin", async () => {
    asRole("lead");
    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "target" }),
    });
    expect(res.status).toBe(401);
  });

  it("200 updates another user's role", async () => {
    asRole("admin", "self");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindFirst.mockResolvedValueOnce({ id: "target", role: "crew" } as any);
    const updated = {
      id: "target",
      name: "B",
      email: "b@x.dev",
      role: "lead",
      createdAt: new Date(),
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce(updated as any);

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("lead");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target" },
        data: { role: "lead" },
      })
    );
  });

  it("400 CANNOT_DEMOTE_SELF when admin tries to demote themselves", async () => {
    asRole("admin", "self");

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "self" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CANNOT_DEMOTE_SELF");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows admin to keep self at admin (no-op self update)", async () => {
    asRole("admin", "self");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindFirst.mockResolvedValueOnce({ id: "self", role: "admin" } as any);
    const updated = {
      id: "self",
      name: "A",
      email: "a@x.dev",
      role: "admin",
      createdAt: new Date(),
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce(updated as any);

    const res = await PATCH(makePatch({ role: "admin" }), {
      params: Promise.resolve({ id: "self" }),
    });

    expect(res.status).toBe(200);
  });

  it("404 when target user is not in the caller's org", async () => {
    asRole("admin", "self");
    mockFindFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("400 LAST_ADMIN when demoting the only admin (different user)", async () => {
    asRole("admin", "self");
    const lastAdminStub = { id: "lastAdmin", role: "admin" };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindFirst.mockResolvedValueOnce(lastAdminStub as any);
    mockCount.mockResolvedValueOnce(1); // only one admin total in the org

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "lastAdmin" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LAST_ADMIN");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("400 VALIDATION_FAILED on invalid role", async () => {
    asRole("admin");
    const res = await PATCH(makePatch({ role: "owner" }), {
      params: Promise.resolve({ id: "target" }),
    });
    expect(res.status).toBe(400);
  });
});
