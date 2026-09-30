import { prisma } from "@/lib/prisma";

export function findCredentialsUser(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      orgId: true,
      role: true,
      archived: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });
}

/** One row-locked statement: concurrent failures cannot overwrite each other.
 * Expired lockouts start a fresh budget; attempts during a lock cannot extend it.
 * Email lookup is intentionally global because sign-in precedes org scoping. */
export function recordFailedLogin(
  userId: string,
  now: Date,
  maxAttempts: number,
  lockoutWindowMs: number
) {
  const until = new Date(now.getTime() + lockoutWindowMs);
  return prisma.$executeRaw`
    UPDATE "User"
    SET "failedLoginCount" = CASE
          WHEN "lockedUntil" <= ${now} THEN 1
          ELSE "failedLoginCount" + 1
        END,
        "lockedUntil" = CASE
          WHEN (CASE WHEN "lockedUntil" <= ${now} THEN 1
                     ELSE "failedLoginCount" + 1 END) >= ${maxAttempts}
          THEN ${until}
          ELSE NULL
        END
    WHERE id = ${userId} AND archived = false
      AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
  `;
}

export function clearLoginFailures(userId: string) {
  return prisma.user.updateMany({
    where: { id: userId, archived: false },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
