import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Brute-force / credential-stuffing protection for the credentials login
 * flow (consumed by `lib/auth.ts`'s `authorize()`).
 *
 * DB-backed (no Redis/Upstash in this codebase): two extra columns on
 * `User` — `failedLoginCount` and `lockedUntil` — track consecutive
 * failures and an optional lockout expiry. All state lives on the row the
 * initial lookup already fetches, so the common paths cost one extra
 * round trip (a single `update`), not more.
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  password: true,
  orgId: true,
  role: true,
  archived: true,
  failedLoginCount: true,
  lockedUntil: true,
} as const;

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  orgId: string;
  role: string;
};

/**
 * Verifies email/password credentials with account lockout.
 *
 * Returns the authenticated user on success, or `null` on any failure —
 * unknown email, archived account, currently-locked account, or wrong
 * password. The caller (NextAuth's `authorize()`) must not distinguish
 * these cases in what it surfaces to the client: doing so would let an
 * attacker enumerate valid emails or learn an account is locked out.
 *
 * A locked account is rejected before `bcrypt.compare` runs at all, so a
 * lockout can't be probed via response-timing either.
 */
export async function authenticateCredentials(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: AUTH_USER_SELECT,
  });

  if (!user || user.archived) return null;

  // Locked accounts are rejected without ever touching bcrypt — a locked
  // window is a hard stop, not just a slower path.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    const failedLoginCount = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data:
        failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS
          ? {
              failedLoginCount,
              lockedUntil: new Date(Date.now() + LOCKOUT_WINDOW_MS),
            }
          : { failedLoginCount },
    });
    return null;
  }

  // Success: clear any accumulated failures/lockout. Skip the write when
  // there's nothing to reset — the overwhelmingly common case.
  if (user.failedLoginCount !== 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    orgId: user.orgId,
    role: user.role,
  };
}
