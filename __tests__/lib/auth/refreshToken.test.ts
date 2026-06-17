import { describe, expect, it, vi } from "vitest";
import {
  type AuthToken,
  REVALIDATE_INTERVAL_SECONDS,
  refreshAuthToken,
} from "@/lib/auth/refreshToken";
import type { AuthUser } from "@/lib/repositories/userRepo";

function loaderReturning(user: AuthUser | null) {
  return vi.fn(async (_id: string) => user);
}

const ACTIVE: AuthUser = { orgId: "org_1", role: "lead", archived: false };
const NOW = 1_000_000; // fixed epoch-seconds
// A token whose last re-validation is old enough to be due for a fresh check.
const DUE = NOW - REVALIDATE_INTERVAL_SECONDS;

describe("refreshAuthToken", () => {
  it("refreshes role and orgId from the live DB record", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org_1",
      role: "crew",
      revalidatedAt: DUE,
    };
    const load = loaderReturning({
      orgId: "org_2",
      role: "admin",
      archived: false,
    });

    const result = await refreshAuthToken(token, load, NOW);

    expect(load).toHaveBeenCalledWith("u1");
    expect(result).toMatchObject({
      sub: "u1",
      orgId: "org_2",
      role: "admin",
      revalidatedAt: NOW,
    });
  });

  it("revokes (null) when the user is archived", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org_1",
      role: "admin",
      revalidatedAt: DUE,
    };
    const load = loaderReturning({ ...ACTIVE, archived: true });

    expect(await refreshAuthToken(token, load, NOW)).toBeNull();
  });

  it("revokes (null) when the user no longer exists", async () => {
    const token: AuthToken = {
      sub: "gone",
      orgId: "org_1",
      role: "admin",
      revalidatedAt: DUE,
    };
    const load = loaderReturning(null);

    expect(await refreshAuthToken(token, load, NOW)).toBeNull();
  });

  it("preserves unrelated token claims while refreshing authority claims", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org_1",
      role: "crew",
      name: "Pat",
      iat: 123,
      revalidatedAt: DUE,
    };
    const result = await refreshAuthToken(token, loaderReturning(ACTIVE), NOW);

    expect(result).toEqual({
      sub: "u1",
      orgId: "org_1",
      role: "lead",
      name: "Pat",
      iat: 123,
      revalidatedAt: NOW,
    });
  });

  it("skips the DB read and returns the token unchanged inside the throttle window", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org_1",
      role: "admin",
      revalidatedAt: NOW - 10, // checked 10s ago — still fresh
    };
    const load = loaderReturning(ACTIVE);

    const result = await refreshAuthToken(token, load, NOW);

    expect(result).toBe(token);
    expect(load).not.toHaveBeenCalled();
  });

  it("re-validates a token that has never been checked (no revalidatedAt)", async () => {
    const token: AuthToken = { sub: "u1", orgId: "org_1", role: "crew" };
    const load = loaderReturning(ACTIVE);

    const result = await refreshAuthToken(token, load, NOW);

    expect(load).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ role: "lead", revalidatedAt: NOW });
  });

  it("leaves a subject-less token untouched without a DB read (fail-safe)", async () => {
    const token: AuthToken = {
      orgId: "org_1",
      role: "admin",
      revalidatedAt: DUE,
    };
    const load = loaderReturning(ACTIVE);

    expect(await refreshAuthToken(token, load, NOW)).toBe(token);
    expect(load).not.toHaveBeenCalled();
  });
});
