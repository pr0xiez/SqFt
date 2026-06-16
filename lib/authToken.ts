import type { SessionClaims } from "@/lib/repositories/userRepo";

type MutableToken = { sub?: string; orgId?: unknown; role?: unknown };

/**
 * Core of the `jwt` callback in `lib/auth.ts`, kept in its own module (free of
 * the `next-auth` import that can't load under vitest) so it can be unit-tested.
 *
 * On initial sign-in (`user` present) it stamps the freshly-authorized claims.
 * On every later request it re-reads the user from the DB (via `fetchClaims`)
 * so that:
 *   - an archived/deleted user's live session is revoked (returns `null`, which
 *     NextAuth treats as an invalid session), and
 *   - role/orgId changes take effect immediately instead of being trusted as
 *     baked in at sign-in.
 */
export async function revalidateJwt<T extends MutableToken>(
  token: T,
  user: { orgId: string; role: string } | undefined,
  fetchClaims: (id: string) => Promise<SessionClaims | null>
): Promise<T | null> {
  if (user) {
    token.orgId = user.orgId;
    token.role = user.role;
    return token;
  }

  if (token.sub) {
    const claims = await fetchClaims(token.sub);
    if (!claims || claims.archived) return null;
    token.orgId = claims.orgId;
    token.role = claims.role;
  }
  return token;
}
