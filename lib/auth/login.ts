import bcrypt from "bcryptjs";
import {
  clearLoginFailures,
  findCredentialsUser,
  recordFailedLogin,
} from "@/lib/repositories/loginRepo";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// A valid cost-10 hash used only to pay bcrypt's cost on ineligible accounts.
// This reduces the large timing difference; it is not a constant-time promise.
const DUMMY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  orgId: string;
  role: string;
};

/** All failures return null. Lockout writes are atomic across server instances. */
export async function authenticateCredentials(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const user = await findCredentialsUser(email);
  const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
  const eligible = !!user && !user.archived && !locked;
  const valid = await bcrypt.compare(
    password,
    eligible ? user.password : DUMMY_HASH
  );
  if (!user || !eligible) return null;

  if (!valid) {
    await recordFailedLogin(
      user.id,
      new Date(),
      MAX_FAILED_LOGIN_ATTEMPTS,
      LOCKOUT_WINDOW_MS
    );
    return null;
  }

  if (user.failedLoginCount !== 0 || user.lockedUntil !== null) {
    const cleared = await clearLoginFailures(user.id);
    if (cleared.count === 0) return null;
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    orgId: user.orgId,
    role: user.role,
  };
}
