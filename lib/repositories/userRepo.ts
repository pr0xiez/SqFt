import type { AuthUserRow } from "@/lib/auth/revalidate";
import { prisma } from "@/lib/prisma";

/**
 * Read the auth-relevant fields for a user by id alone.
 *
 * Not org-scoped: the caller (the JWT re-validation in `lib/auth.ts`) is
 * re-validating the token holder, whose org is exactly what we're refreshing.
 * Returns null when the user no longer exists, which the auth layer treats as a
 * revoked session.
 */
export function findAuthUser(id: string): Promise<AuthUserRow | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, orgId: true, role: true },
  });
}
