import { describe, expect, it, vi } from "vitest";
import { revalidateJwt } from "@/lib/authToken";
import type { SessionClaims } from "@/lib/repositories/userRepo";

const claims = (over: Partial<SessionClaims> = {}): SessionClaims => ({
  archived: false,
  role: "crew",
  orgId: "org-1",
  ...over,
});

describe("revalidateJwt", () => {
  it("stamps claims from `user` on initial sign-in without hitting the DB", async () => {
    const fetchClaims = vi.fn();
    const token = { sub: "u1" };
    const out = await revalidateJwt(
      token,
      { orgId: "org-1", role: "admin" },
      fetchClaims
    );
    expect(out).toEqual({ sub: "u1", orgId: "org-1", role: "admin" });
    expect(fetchClaims).not.toHaveBeenCalled();
  });

  it("refreshes role/orgId from the DB on a later request (role change takes effect)", async () => {
    const fetchClaims = vi.fn(async () =>
      claims({ role: "lead", orgId: "org-1" })
    );
    const token = { sub: "u1", role: "crew", orgId: "org-1" };
    const out = await revalidateJwt(token, undefined, fetchClaims);
    expect(fetchClaims).toHaveBeenCalledWith("u1");
    expect(out).toMatchObject({ role: "lead", orgId: "org-1" });
  });

  it("invalidates the session (returns null) when the user is now archived", async () => {
    const fetchClaims = vi.fn(async () => claims({ archived: true }));
    const out = await revalidateJwt(
      { sub: "u1", role: "admin", orgId: "org-1" },
      undefined,
      fetchClaims
    );
    expect(out).toBeNull();
  });

  it("invalidates the session when the user no longer exists", async () => {
    const fetchClaims = vi.fn(async () => null);
    const out = await revalidateJwt(
      { sub: "u1", role: "admin", orgId: "org-1" },
      undefined,
      fetchClaims
    );
    expect(out).toBeNull();
  });

  it("leaves a token without a sub untouched (no DB call)", async () => {
    const fetchClaims = vi.fn();
    const token = {};
    const out = await revalidateJwt(token, undefined, fetchClaims);
    expect(out).toBe(token);
    expect(fetchClaims).not.toHaveBeenCalled();
  });
});
