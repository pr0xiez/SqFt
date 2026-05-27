import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/onboarding/createOrganization", () => ({
  createOrganization: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/admin/orgs/route";
import { EmailTakenError } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { createOrganization } from "@/lib/onboarding/createOrganization";
import { prisma } from "@/lib/prisma";
import { makeRequest, noParams } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindMany = vi.mocked(prisma.organization.findMany);
const mockCreate = vi.mocked(createOrganization);

function asSuperAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue({
    user: { id: "u1", orgId: "o1", role: "admin", email: "boss@sqft.dev" },
    // biome-ignore lint/suspicious/noExplicitAny: test stub
  } as any);
}

function asNormalAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue({
    user: { id: "u1", orgId: "o1", role: "admin", email: "regular@sqft.dev" },
    // biome-ignore lint/suspicious/noExplicitAny: test stub
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/orgs", () => {
  it("401 when no session", async () => {
    process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not super-admin", async () => {
    asNormalAdmin();
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
  });

  it("returns the org list with status, dates, and user count", async () => {
    asSuperAdmin();
    const stub = [
      {
        id: "o1",
        name: "Acme Floors",
        slug: "acme-floors",
        subscriptionStatus: "manual",
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        createdAt: new Date("2026-05-20T00:00:00Z"),
        _count: { users: 3 },
      },
      {
        id: "o2",
        name: "Pinecrest",
        slug: "pinecrest",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-06-08T00:00:00Z"),
        currentPeriodEndsAt: new Date("2026-07-08T00:00:00Z"),
        createdAt: new Date("2026-05-25T00:00:00Z"),
        _count: { users: 1 },
      },
    ];
    // biome-ignore lint/suspicious/noExplicitAny: prisma row shape
    mockFindMany.mockResolvedValueOnce(stub as any);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: "o1",
      name: "Acme Floors",
      slug: "acme-floors",
      subscriptionStatus: "manual",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      createdAt: "2026-05-20T00:00:00.000Z",
      userCount: 3,
    });
    expect(body[1]?.userCount).toBe(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { users: true } },
        }),
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("POST /api/admin/orgs", () => {
  const validBody = {
    orgName: "Pinecrest Flooring",
    adminName: "Pat Pine",
    adminEmail: "Pat@Pinecrest.test",
    adminPassword: "supersecret1",
  };

  it("401 when no session", async () => {
    process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not super-admin", async () => {
    asNormalAdmin();
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400 when validation fails", async () => {
    asSuperAdmin();
    const res = await POST(
      makeRequest("POST", "http://localhost/", {
        orgName: "",
        adminName: "Pat",
        adminEmail: "not-an-email",
        adminPassword: "short",
      }),
      noParams
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("201 and returns the new org id + slug + email on success", async () => {
    asSuperAdmin();
    mockCreate.mockResolvedValueOnce({
      orgId: "org-new",
      adminUserId: "user-new",
      slug: "pinecrest-flooring",
    });
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      orgId: "org-new",
      slug: "pinecrest-flooring",
      adminEmail: "pat@pinecrest.test",
    });
    expect(mockCreate).toHaveBeenCalledWith({
      org: { name: "Pinecrest Flooring" },
      admin: {
        name: "Pat Pine",
        email: "pat@pinecrest.test",
        password: "supersecret1",
      },
      billing: { kind: "manual" },
    });
  });

  it("translates EmailTakenError to 409 EMAIL_TAKEN", async () => {
    asSuperAdmin();
    mockCreate.mockRejectedValueOnce(new EmailTakenError());
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMAIL_TAKEN");
  });

  it("translates unexpected errors to 500 INTERNAL", async () => {
    asSuperAdmin();
    mockCreate.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(500);
  });
});
