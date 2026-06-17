import type { AuthUser } from "@/lib/repositories/userRepo";

/**
 * How long (seconds) a JWT may go between DB re-validations of its
 * `orgId`/`role`/`archived` claims. Revocation (archiving) and role/org changes
 * take effect within this window on a live session, instead of being trusted
 * for the whole `session.maxAge`. Short enough to make revocation
 * near-real-time, long enough to keep the DB read off most requests rather than
 * hitting it on every token refresh.
 */
export const REVALIDATE_INTERVAL_SECONDS = 5 * 60; // 5 minutes

/**
 * The session-authority claims carried on the JWT. NextAuth's own fields
 * (`sub`, `iat`, …) live alongside these but aren't our concern here.
 * `revalidatedAt` is our bookkeeping: epoch-seconds of the last DB re-check.
 */
export type AuthToken = {
  sub?: string;
  orgId?: unknown;
  role?: unknown;
  revalidatedAt?: number;
  [key: string]: unknown;
};

/**
 * Re-validate an already-issued JWT against the live user record.
 *
 * Sign-in bakes `orgId`/`role` into the token; without this, an admin who
 * archives a user or changes their role has no effect on that user's existing
 * session until the token expires. On token refresh — at most once per
 * `REVALIDATE_INTERVAL_SECONDS`, since this fires on every request and the DB
 * read isn't free — we re-read the user and:
 *   - return `null` when the user is archived or no longer exists — NextAuth
 *     treats a null jwt result as session invalidation (revocation);
 *   - otherwise refresh `orgId` and `role` from the DB so admin changes take
 *     effect on the live session, keeping org-scoping tied to the same record.
 *
 * Within the throttle window the token is returned untouched (no DB read).
 *
 * Pure: the DB read and clock are injected (`loadUser`, `now`), so the callback
 * logic is testable without a database.
 */
export async function refreshAuthToken(
  token: AuthToken,
  loadUser: (id: string) => Promise<AuthUser | null>,
  now: number = Math.floor(Date.now() / 1000)
): Promise<AuthToken | null> {
  // Throttle: skip the DB read while the last re-validation is still fresh.
  const lastChecked = token.revalidatedAt ?? 0;
  if (now - lastChecked < REVALIDATE_INTERVAL_SECONDS) return token;

  const id = token.sub;
  // No subject means there's nothing to re-validate against (shouldn't happen
  // for an authenticated token, but fail safe by leaving the token untouched).
  if (typeof id !== "string" || id.length === 0) return token;

  const user = await loadUser(id);
  if (!user || user.archived) return null;

  return { ...token, orgId: user.orgId, role: user.role, revalidatedAt: now };
}
