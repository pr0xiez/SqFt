/**
 * Multi-tenancy enforcement.
 * Every API route calls getOrgId() to scope queries to the caller's organization.
 */

import { UnauthorizedError } from "@/lib/api/errors";
import { auth } from "@/lib/auth";

/** Extract the org ID from the current session. Throws UnauthorizedError if not authenticated. */
export async function getOrgId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.orgId) {
    throw new UnauthorizedError();
  }
  return session.user.orgId;
}

/** Returns the full session (user + org). Throws UnauthorizedError if unauthenticated. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthorizedError();
  }
  return session;
}
