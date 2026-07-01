import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/repositories", () => ({
  getOrgById: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  findByEmail: vi.fn(),
  updateRole: vi.fn(),
  updateProfile: vi.fn(),
  setArchived: vi.fn(),
  findUserRow: vi.fn(),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed-pw") },
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { PATCH } from "@/app/api/admin/orgs/[orgId]/users/[userId]/route";
import { GET, POST } from "@/app/api/admin/orgs/[orgId]/users/route";
import { LastAdminError } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import * as repos from "@/lib/repositories";
import { makeRequest, params } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const p = params({ orgId: "org1" });
const pu = params({ orgId: "org1", userId: "m1" });

function asSuperAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue({
    user: {
      id: "u1",
      orgId: "operator-org",
      role: "admin",
      email: "boss@sqft.dev",
    },
    // biome-ignore lint/suspicious/noExplicitAny: test stub
  } as any);
}
function asNormalAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue({
    user: {
      id: "u1",
      orgId: "operator-org",
      role: "admin",
      email: "regular@sqft.dev",
    },
    // biome-ignore lint/suspicious/noExplicitAny: test stub
  } as any);
}

const ORIGINAL = process.env.SUPER_ADMIN_EMAILS;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SUPER_ADMIN_EMAILS;
  else process.env.SUPER_ADMIN_EMAILS = ORIGINAL;
});

describe("GET /api/admin/orgs/[orgId]/users", () => {
  it("401 when no session", async () => {
    process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(401);
  });

  it("403 when not super-admin", async () => {
    asNormalAdmin();
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(403);
  });

  it("404 when the org does not exist", async () => {
    asSuperAdmin();
    vi.mocked(repos.getOrgById).mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(404);
    expect(repos.listUsers).not.toHaveBeenCalled();
  });

  it("lists the target org's members (incl. archived)", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.listUsers).mockResolvedValueOnce([{ id: "m1" }] as any);
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(200);
    expect(repos.listUsers).toHaveBeenCalledWith("org1", {
      includeArchived: true,
    });
  });
});

describe("POST /api/admin/orgs/[orgId]/users", () => {
  const body = {
    name: "New Hire",
    email: "New@Org.test",
    role: "crew",
    password: "supersecret1",
  };

  it("403 when not super-admin", async () => {
    asNormalAdmin();
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(403);
    expect(repos.createUser).not.toHaveBeenCalled();
  });

  it("404 when the org does not exist", async () => {
    asSuperAdmin();
    vi.mocked(repos.getOrgById).mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(404);
    expect(repos.createUser).not.toHaveBeenCalled();
  });

  it("400 on invalid body", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    const res = await POST(
      makeRequest("POST", "http://localhost/", {
        name: "",
        email: "x",
        role: "boss",
        password: "short",
      }),
      p
    );
    expect(res.status).toBe(400);
    expect(repos.createUser).not.toHaveBeenCalled();
  });

  it("409 EMAIL_TAKEN when the email exists", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    vi.mocked(repos.findByEmail).mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: partial stub
      { id: "existing" } as any
    );
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EMAIL_TAKEN");
  });

  it("201 creates the user in the TARGET org with a hashed, lowercased email", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    vi.mocked(repos.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(repos.createUser).mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: partial stub
      { id: "m2", email: "new@org.test" } as any
    );
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(201);
    expect(repos.createUser).toHaveBeenCalledWith("org1", {
      name: "New Hire",
      email: "new@org.test",
      role: "crew",
      password: "hashed-pw",
    });
  });
});

describe("PATCH /api/admin/orgs/[orgId]/users/[userId]", () => {
  it("403 when not super-admin", async () => {
    asNormalAdmin();
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost/", { role: "lead" }),
      pu
    );
    expect(res.status).toBe(403);
    expect(repos.updateRole).not.toHaveBeenCalled();
  });

  it("changes a role scoped to the URL org and returns the row", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.updateRole).mockResolvedValueOnce({
      id: "m1",
      role: "lead",
    } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.findUserRow).mockResolvedValueOnce({
      id: "m1",
      role: "lead",
    } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost/", { role: "lead" }),
      pu
    );
    expect(res.status).toBe(200);
    expect(repos.updateRole).toHaveBeenCalledWith("m1", "org1", "lead");
  });

  it("404 when the user is not in that org", async () => {
    asSuperAdmin();
    vi.mocked(repos.updateRole).mockResolvedValueOnce(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost/", { role: "lead" }),
      pu
    );
    expect(res.status).toBe(404);
  });

  it("archives a member", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.setArchived).mockResolvedValueOnce({
      id: "m1",
      archived: true,
    } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.findUserRow).mockResolvedValueOnce({
      id: "m1",
      archived: true,
    } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost/", { archived: true }),
      pu
    );
    expect(res.status).toBe(200);
    expect(repos.setArchived).toHaveBeenCalledWith("m1", "org1", true);
  });

  it("400 LAST_ADMIN when the repo refuses to demote the last admin", async () => {
    asSuperAdmin();
    vi.mocked(repos.updateRole).mockRejectedValueOnce(new LastAdminError());
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost/", { role: "crew" }),
      pu
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("LAST_ADMIN");
  });
});
