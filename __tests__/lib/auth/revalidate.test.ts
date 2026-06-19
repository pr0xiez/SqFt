import { describe, expect, it, vi } from "vitest";
import {
  type AuthToken,
  DEFAULT_REVALIDATE_INTERVAL_MS,
  revalidateToken,
} from "@/lib/auth/revalidate";
import type { AuthState } from "@/lib/repositories/userRepo";

const INTERVAL = DEFAULT_REVALIDATE_INTERVAL_MS;

function loader(state: AuthState | null) {
  return vi.fn(async (_id: string) => state);
}

describe("revalidateToken", () => {
  it("reflects a role change on the next refresh past the interval", async () => {
    // Token was minted as crew; the DB now says lead (admin promoted them).
    const token: AuthToken = {
      sub: "u1",
      orgId: "org-1",
      role: "crew",
      revalidatedAt: 0,
    };
    const load = loader({ role: "lead", orgId: "org-1", archived: false });

    const next = await revalidateToken(token, INTERVAL, load);

    expect(load).toHaveBeenCalledWith("u1");
    expect(next).not.toBeNull();
    expect(next?.role).toBe("lead");
    expect(next?.orgId).toBe("org-1");
    expect(next?.revalidatedAt).toBe(INTERVAL);
  });

  it("invalidates the session when the user no longer exists (revoked)", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org-1",
      role: "admin",
      revalidatedAt: 0,
    };
    const load = loader(null);

    const next = await revalidateToken(token, INTERVAL, load);

    expect(load).toHaveBeenCalledWith("u1");
    expect(next).toBeNull();
  });

  it("invalidates the session for an archived user", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org-1",
      role: "lead",
      revalidatedAt: 0,
    };
    const load = loader({ role: "lead", orgId: "org-1", archived: true });

    const next = await revalidateToken(token, INTERVAL, load);

    expect(load).toHaveBeenCalledWith("u1");
    expect(next).toBeNull();
  });

  it("skips the DB read inside the revalidation window", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org-1",
      role: "crew",
      revalidatedAt: 1_000,
    };
    const load = loader({ role: "admin", orgId: "org-1", archived: false });

    // now is only halfway through the interval since the last check.
    const next = await revalidateToken(token, 1_000 + INTERVAL / 2, load);

    expect(load).not.toHaveBeenCalled();
    expect(next).toBe(token); // untouched, stale claim still trusted briefly
  });

  it("re-validates a token with no revalidatedAt stamp once the interval elapses", async () => {
    // An unstamped token (e.g. minted before this change shipped) is treated as
    // last-checked at epoch 0, so it re-validates once `now` passes the
    // interval — bounding its staleness to a single window.
    const token: AuthToken = { sub: "u1", orgId: "org-1", role: "crew" };
    const load = loader({ role: "crew", orgId: "org-1", archived: false });

    const next = await revalidateToken(token, INTERVAL + 1, load);

    expect(load).toHaveBeenCalled();
    expect(next?.revalidatedAt).toBe(INTERVAL + 1);
  });

  it("leaves a subject-less token untouched without a DB read", async () => {
    const token: AuthToken = { orgId: "org-1", role: "crew" };
    const load = loader({ role: "admin", orgId: "org-1", archived: false });

    const next = await revalidateToken(token, INTERVAL, load);

    expect(load).not.toHaveBeenCalled();
    expect(next).toBe(token);
  });

  it("honors a custom interval argument", async () => {
    const token: AuthToken = {
      sub: "u1",
      orgId: "org-1",
      role: "crew",
      revalidatedAt: 0,
    };
    const load = loader({ role: "lead", orgId: "org-1", archived: false });

    // With a 10s interval, a 5s-old token is still fresh → no DB read.
    const fresh = await revalidateToken(token, 5_000, load, 10_000);
    expect(fresh).toBe(token);
    expect(load).not.toHaveBeenCalled();

    // Past 10s → re-validates.
    const stale = await revalidateToken(token, 11_000, load, 10_000);
    expect(load).toHaveBeenCalled();
    expect(stale?.role).toBe("lead");
  });
});
