import { describe, expect, it } from "vitest";
import {
  type AuthUserRow,
  decideRevalidation,
  REVALIDATE_INTERVAL_MS,
  shouldRevalidate,
} from "@/lib/auth/revalidate";

describe("shouldRevalidate", () => {
  it("re-validates a token that has never been validated", () => {
    expect(shouldRevalidate({}, 1_000_000)).toBe(true);
  });

  it("skips re-validation within the throttle window", () => {
    const now = 1_000_000;
    const claims = { revalidatedAt: now - (REVALIDATE_INTERVAL_MS - 1) };
    expect(shouldRevalidate(claims, now)).toBe(false);
  });

  it("re-validates once the throttle window has elapsed", () => {
    const now = 1_000_000;
    const claims = { revalidatedAt: now - REVALIDATE_INTERVAL_MS };
    expect(shouldRevalidate(claims, now)).toBe(true);
  });

  it("treats a non-numeric revalidatedAt as never validated", () => {
    expect(shouldRevalidate({ revalidatedAt: "nope" }, 1_000_000)).toBe(true);
  });

  it("honors a custom interval", () => {
    const now = 100;
    // elapsed = 40ms since last validation
    expect(shouldRevalidate({ revalidatedAt: 60 }, now, 30)).toBe(true);
    expect(shouldRevalidate({ revalidatedAt: 60 }, now, 50)).toBe(false);
  });
});

describe("decideRevalidation", () => {
  const now = 1_700_000_000_000;

  it("invalidates when the user no longer exists", () => {
    expect(decideRevalidation(null, now)).toEqual({ kind: "invalidate" });
  });

  it("refreshes orgId/role from the DB row and stamps the time", () => {
    const dbUser: AuthUserRow = { id: "u1", orgId: "org-2", role: "crew" };
    expect(decideRevalidation(dbUser, now)).toEqual({
      kind: "refresh",
      orgId: "org-2",
      role: "crew",
      revalidatedAt: now,
    });
  });

  it("picks up a role demotion (admin → crew)", () => {
    // Token was minted with admin; DB now says crew.
    const dbUser: AuthUserRow = { id: "u1", orgId: "org-1", role: "crew" };
    const result = decideRevalidation(dbUser, now);
    expect(result).toMatchObject({ kind: "refresh", role: "crew" });
  });

  it("picks up a role promotion (crew → admin)", () => {
    const dbUser: AuthUserRow = { id: "u1", orgId: "org-1", role: "admin" };
    const result = decideRevalidation(dbUser, now);
    expect(result).toMatchObject({ kind: "refresh", role: "admin" });
  });
});
