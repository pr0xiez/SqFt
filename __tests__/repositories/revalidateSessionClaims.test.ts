import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma client so this runs in the DB-less unit job. We assert the
// revoke/refresh decision logic of revalidateSessionClaims, which backs the
// `jwt` callback in lib/auth.ts (live archiving / role-change enforcement).
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

import { revalidateSessionClaims } from "@/lib/repositories/userRepo";

describe("revalidateSessionClaims", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns current { orgId, role } for an active user (refresh path)", async () => {
    findUnique.mockResolvedValue({
      orgId: "org_1",
      role: "lead",
      archived: false,
    });
    expect(await revalidateSessionClaims("u1")).toEqual({
      orgId: "org_1",
      role: "lead",
    });
  });

  it("reflects a role change made after sign-in", async () => {
    findUnique.mockResolvedValue({
      orgId: "org_1",
      role: "crew",
      archived: false,
    });
    const claims = await revalidateSessionClaims("u1");
    expect(claims?.role).toBe("crew");
  });

  it("revokes (null) when the user is archived", async () => {
    findUnique.mockResolvedValue({
      orgId: "org_1",
      role: "admin",
      archived: true,
    });
    expect(await revalidateSessionClaims("u1")).toBeNull();
  });

  it("revokes (null) when the user no longer exists", async () => {
    findUnique.mockResolvedValue(null);
    expect(await revalidateSessionClaims("ghost")).toBeNull();
  });

  it("sources orgId from the row, never the caller", async () => {
    findUnique.mockResolvedValue({
      orgId: "real_org",
      role: "lead",
      archived: false,
    });
    const claims = await revalidateSessionClaims("u1");
    expect(claims?.orgId).toBe("real_org");
    // Looked up by id alone.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } })
    );
  });
});
