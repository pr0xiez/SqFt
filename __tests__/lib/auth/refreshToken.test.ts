import { describe, expect, it, vi } from "vitest";
import { type AuthToken, refreshAuthToken } from "@/lib/auth/refreshToken";
import type { AuthUser } from "@/lib/repositories/userRepo";

function loaderReturning(user: AuthUser | null) {
  return vi.fn(async (_id: string) => user);
}

const ACTIVE: AuthUser = { orgId: "org_1", role: "lead", archived: false };

describe("refreshAuthToken", () => {
  it("refreshes role and orgId from the live DB record", async () => {
    const token: AuthToken = { sub: "u1", orgId: "org_1", role: "crew" };
    const load = loaderReturning({
      orgId: "org_2",
      role: "admin",
      archived: false,
    });

    const result = await refreshAuthToken(token, load);

    expect(load).toHaveBeenCalledWith("u1");
    expect(result).toMatchObject({ sub: "u1", orgId: "org_2", role: "admin" });
  });

  it("revokes (null) when the user is archived", async () => {
    const token: AuthToken = { sub: "u1", orgId: "org_1", role: "admin" };
    const load = loaderReturning({ ...ACTIVE, archived: true });

    expect(await refreshAuthToken(token, load)).toBeNull();
  });

  it("revokes (null) when the user no longer exists", async () => {
    const token: AuthToken = { sub: "gone", orgId: "org_1", role: "admin" };
    const load = loaderReturning(null);

    expect(await refreshAuthToken(token, load)).toBeNull();
  });

  it("preserves unrelated token claims while refreshing authority claims", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org_1",
      role: "crew",
      name: "Pat",
      iat: 123,
    };
    const result = await refreshAuthToken(token, loaderReturning(ACTIVE));

    expect(result).toEqual({
      sub: "u1",
      orgId: "org_1",
      role: "lead",
      name: "Pat",
      iat: 123,
    });
  });

  it("leaves a subject-less token untouched without a DB read (fail-safe)", async () => {
    const token: AuthToken = { orgId: "org_1", role: "admin" };
    const load = loaderReturning(ACTIVE);

    expect(await refreshAuthToken(token, load)).toBe(token);
    expect(load).not.toHaveBeenCalled();
  });
});
