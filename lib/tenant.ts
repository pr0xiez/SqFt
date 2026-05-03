/**
 * Multi-tenancy enforcement.
 * Every API route calls getOrgId() to scope queries to the caller's organization.
 */

import { auth } from "@/lib/auth";

/** Extract the org ID from the current session. Throws 401 if not authenticated. */
export async function getOrgId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.orgId) {
    throw new Error("Unauthorized");
  }
  return session.user.orgId;
}

/** Returns the full session (user + org). Throws 401 if unauthenticated. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}
