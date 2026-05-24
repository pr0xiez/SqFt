/**
 * Tier-B route tests: PATCH /api/org gates on admin, validates input,
 * and returns the updated org. Auth/role plumbing is covered by
 * adminRoute's own tests; this file focuses on the route's contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET, PATCH } from "@/app/api/org/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockUpdate = vi.mocked(prisma.organization.update);
const mockFindUnique = vi.mocked(prisma.organization.findUnique);

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request("http://localhost/api/org", init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/org"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}
const noParams = { params: Promise.resolve({}) };

function asAdmin() {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { orgId: "org1", role: "admin" } } as any
  );
}
function asCrew() {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { orgId: "org1", role: "crew" } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/org", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest("PATCH", { name: "x" }), noParams);
    expect(res.status).toBe(401);
  });

  it("returns 401 when role is not admin", async () => {
    asCrew();
    const res = await PATCH(makeRequest("PATCH", { name: "x" }), noParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_FAILED on bad hex color", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { brandColor: "not-a-hex" }),
      noParams
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 when defaultDepositPct is out of range", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultDepositPct: 1.5 }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when defaultValidityDays is 0", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultValidityDays: 0 }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("updates only the fields included in the body and returns the org", async () => {
    asAdmin();
    const updated = {
      id: "org1",
      name: "Pinecrest Flooring",
      phone: null,
      address: null,
      licenseNumber: null,
      logo: null,
      timezone: "America/New_York",
      locale: "en-US",
      brandColor: "#3d6b4a",
      tagline: null,
      showLicenseOnQuotes: true,
      defaultDepositPct: 0.4,
      defaultValidityDays: 21,
      defaultUnitLabel: "ft²",
      defaultTerms: "",
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce(updated as any);

    const res = await PATCH(
      makeRequest("PATCH", {
        brandColor: "#3D6B4A",
        defaultDepositPct: 0.4,
      }),
      noParams
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: { brandColor: "#3d6b4a", defaultDepositPct: 0.4 },
      })
    );
  });

  it("normalizes hex to lowercase", async () => {
    asAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce({ brandColor: "#abcdef" } as any);
    await PATCH(makeRequest("PATCH", { brandColor: "#ABCDEF" }), noParams);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { brandColor: "#abcdef" } })
    );
  });

  it("stores empty tagline as null", async () => {
    asAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce({ tagline: null } as any);
    await PATCH(makeRequest("PATCH", { tagline: "" }), noParams);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tagline: null } })
    );
  });

  it("returns 400 on unknown timezone format", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { timezone: "not-a-tz" }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when defaultDepositPct is negative", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultDepositPct: -0.1 }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when defaultValidityDays exceeds 365", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultValidityDays: 366 }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown locale", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { locale: "fr-FR" }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown defaultUnitLabel", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultUnitLabel: "acres" }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 chars", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { name: "x".repeat(101) }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when defaultTerms exceeds 2000 chars", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultTerms: "x".repeat(2001) }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown field (strict schema)", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { unknownField: "x" }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid hyphenated IANA timezone", async () => {
    asAdmin();
    mockUpdate.mockResolvedValueOnce({
      timezone: "America/Port-au-Prince",
      // biome-ignore lint/suspicious/noExplicitAny: test stub
    } as any);
    const res = await PATCH(
      makeRequest("PATCH", { timezone: "America/Port-au-Prince" }),
      noParams
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/org", () => {
  it("returns the org with the new fields included", async () => {
    asAdmin();
    const org = {
      id: "org1",
      name: "Pinecrest",
      brandColor: "#c0341a",
      defaultDepositPct: 0.3,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindUnique.mockResolvedValueOnce(org as any);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(org);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          brandColor: true,
          defaultDepositPct: true,
        }),
      })
    );
  });
});
