/**
 * JWT session re-validation against the database.
 *
 * Background (issue #203): with the `jwt` session strategy, NextAuth bakes
 * `orgId`/`role` into the signed token at sign-in and trusts those claims on
 * every subsequent request. That means an admin action that changes a user's
 * role, archives the user, or removes them entirely has NO effect on that
 * user's live session until the token naturally expires. This module
 * re-derives the trusted claims from the DB so revocation/role changes take
 * effect promptly.
 *
 * Performance tradeoff: re-reading the DB on literally every request is
 * unnecessary. We stamp the token with the time of its last DB check
 * (`revalidatedAt`) and only re-validate once the interval has elapsed. The
 * window is the maximum staleness for a role downgrade, archive, or
 * revocation; pick it short enough that revocation is "prompt" but long enough
 * to keep DB load low. Tune via `AUTH_REVALIDATE_INTERVAL_MS` (set `0` to
 * re-validate on every request).
 *
 * This file is intentionally free of NextAuth and Prisma imports so the policy
 * is unit-testable in isolation: the caller injects "now" and a DB loader.
 */

import type { AuthState } from "@/lib/repositories/userRepo";

/** Shape of the relevant JWT claims this policy reads/writes. */
export type AuthToken = {
  sub?: string;
  orgId?: unknown;
  role?: unknown;
  /** Epoch ms of the last successful DB re-validation. */
  revalidatedAt?: unknown;
};

/** Default max staleness for a role change / archive / revocation: 60 seconds. */
export const DEFAULT_REVALIDATE_INTERVAL_MS = 60_000;

export function revalidateIntervalMs(): number {
  const raw = process.env.AUTH_REVALIDATE_INTERVAL_MS;
  if (!raw) return DEFAULT_REVALIDATE_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REVALIDATE_INTERVAL_MS;
}

/**
 * Decide the next token state on a `jwt` callback invocation that has no fresh
 * `user` (i.e. a subsequent request, not sign-in).
 *
 * Returns:
 *  - the (possibly updated) token to keep the session alive, or
 *  - `null` to invalidate the session — the user no longer exists or is
 *    archived, so NextAuth drops the session and the auth proxy will
 *    redirect/401 them.
 *
 * @param token   current JWT claims
 * @param now     epoch ms (injected for testability)
 * @param load    DB loader: userId → current auth state, or null if gone
 */
export async function revalidateToken<T extends AuthToken>(
  token: T,
  now: number,
  load: (userId: string) => Promise<AuthState | null>,
  intervalMs: number = revalidateIntervalMs()
): Promise<T | null> {
  const userId = token.sub;
  // No subject means we can't re-validate; leave the token untouched and let
  // the session callback's claim-type guard reject a malformed token.
  if (!userId) return token;

  const last =
    typeof token.revalidatedAt === "number" ? token.revalidatedAt : 0;
  // Inside the window: trust the baked-in claims, skip the DB read.
  if (now - last < intervalMs) return token;

  const state = await load(userId);
  // User deleted or archived: deny the session.
  if (!state || state.archived) return null;

  return {
    ...token,
    orgId: state.orgId,
    role: state.role,
    revalidatedAt: now,
  };
}
