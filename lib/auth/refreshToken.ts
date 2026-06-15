import type { AuthUser } from "@/lib/repositories/userRepo";

/**
 * The session-authority claims carried on the JWT. NextAuth's own fields
 * (`sub`, `iat`, …) live alongside these but aren't our concern here.
 */
export type AuthToken = {
  sub?: string;
  orgId?: unknown;
  role?: unknown;
  [key: string]: unknown;
};

/**
 * Re-validate an already-issued JWT against the live user record.
 *
 * Sign-in bakes `orgId`/`role` into the token; without this, an admin who
 * archives a user or changes their role has no effect on that user's existing
 * session until the token expires. On every token refresh we re-read the user
 * and:
 *   - return `null` when the user is archived or no longer exists — NextAuth
 *     treats a null jwt result as session invalidation (revocation);
 *   - otherwise refresh `orgId` and `role` from the DB so admin changes take
 *     effect on the live session, keeping org-scoping tied to the same record.
 *
 * Pure: the DB read is injected via `loadUser`, so the callback logic is
 * testable without a database.
 */
export async function refreshAuthToken(
  token: AuthToken,
  loadUser: (id: string) => Promise<AuthUser | null>
): Promise<AuthToken | null> {
  const id = token.sub;
  // No subject means there's nothing to re-validate against (shouldn't happen
  // for an authenticated token, but fail safe by leaving the token untouched).
  if (typeof id !== "string" || id.length === 0) return token;

  const user = await loadUser(id);
  if (!user || user.archived) return null;

  return { ...token, orgId: user.orgId, role: user.role };
}
