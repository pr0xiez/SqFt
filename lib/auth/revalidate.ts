/**
 * Live JWT re-validation policy.
 *
 * Issue #203: orgId/role were baked into the JWT at sign-in and never checked
 * again, so a demoted user kept their elevated role (and a deleted user kept a
 * working session) for the lifetime of the token. This module re-reads the
 * authoritative user row from the DB on subsequent requests and decides how the
 * token's claims should be refreshed — or whether the session is now invalid.
 *
 * The logic here is pure so it can be unit-tested without NextAuth or a DB; the
 * `jwt` callback in `lib/auth.ts` performs the actual DB read and applies the
 * result.
 */

/** The authoritative user fields the auth layer cares about. */
export type AuthUserRow = { id: string; orgId: string; role: string };

/** The subset of JWT claims this app maintains beyond the standard fields. */
export type AppTokenClaims = {
  /** User id (NextAuth's `sub`). */
  sub?: string;
  orgId?: unknown;
  role?: unknown;
  /** Epoch ms of the last successful DB re-validation. */
  revalidatedAt?: unknown;
};

/**
 * How often (ms) to re-read the DB on subsequent requests. The proxy/`auth()`
 * wrapper invokes the `jwt` callback on a broad set of requests; without a
 * throttle that would be a DB query per request (including static-ish ones).
 * 60s bounds the staleness of a revoked/demoted session to at most a minute
 * while keeping the query rate negligible.
 */
export const REVALIDATE_INTERVAL_MS = 60_000;

/** Whether enough time has elapsed since the last DB re-validation to re-read. */
export function shouldRevalidate(
  claims: AppTokenClaims,
  now: number,
  intervalMs: number = REVALIDATE_INTERVAL_MS
): boolean {
  const last =
    typeof claims.revalidatedAt === "number" ? claims.revalidatedAt : 0;
  return now - last >= intervalMs;
}

export type RevalidationResult =
  | { kind: "invalidate" }
  | { kind: "refresh"; orgId: string; role: string; revalidatedAt: number };

/**
 * Decide the new token state given the freshly-read DB row.
 *
 * - `dbUser === null` (user deleted / no longer exists) → invalidate.
 * - otherwise → refresh orgId/role from the DB and stamp `revalidatedAt`.
 *
 * If `User.archived` is added later, callers should pass an archived user as
 * `null` (i.e. don't fetch archived rows) so it falls into the invalidate path.
 */
export function decideRevalidation(
  dbUser: AuthUserRow | null,
  now: number
): RevalidationResult {
  if (!dbUser) return { kind: "invalidate" };
  return {
    kind: "refresh",
    orgId: dbUser.orgId,
    role: dbUser.role,
    revalidatedAt: now,
  };
}
