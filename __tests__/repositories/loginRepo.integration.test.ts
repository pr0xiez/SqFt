import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  clearLoginFailures,
  recordFailedLogin,
} from "@/lib/repositories/loginRepo";

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)(
  "atomic login failure budget",
  () => {
    let orgId: string;
    let userId: string;

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const org = await prisma.organization.create({
        data: { name: "Login regression", slug: `login-regression-${suffix}` },
      });
      orgId = org.id;
      const user = await prisma.user.create({
        data: {
          orgId,
          name: "Login regression",
          email: `login-${suffix}@example.test`,
          password: "unused",
          role: "admin",
        },
      });
      userId = user.id;
    });

    afterAll(async () => {
      if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    });

    it("locks under concurrent failures without losing increments or extending the lock", async () => {
      const now = new Date();
      await Promise.all(
        Array.from({ length: 20 }, () =>
          recordFailedLogin(userId, now, 5, 900_000)
        )
      );
      const locked = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(locked.failedLoginCount).toBe(5);
      expect(locked.lockedUntil?.getTime()).toBe(now.getTime() + 900_000);
      await recordFailedLogin(
        userId,
        new Date(now.getTime() + 60_000),
        5,
        900_000
      );
      const unchanged = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(unchanged.failedLoginCount).toBe(5);
      expect(unchanged.lockedUntil).toEqual(locked.lockedUntil);
    });

    it("starts a fresh budget after expiry rather than re-locking on one failure", async () => {
      const now = new Date();
      await prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 5,
          lockedUntil: new Date(now.getTime() - 1000),
        },
      });
      await Promise.all(
        Array.from({ length: 3 }, () =>
          recordFailedLogin(userId, now, 5, 900_000)
        )
      );
      const retry = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(retry.failedLoginCount).toBe(3);
      expect(retry.lockedUntil).toBeNull();
    });

    it("does not mutate archived accounts", async () => {
      await clearLoginFailures(userId);
      await prisma.user.update({
        where: { id: userId },
        data: { archived: true },
      });
      await recordFailedLogin(userId, new Date(), 5, 900_000);
      const archived = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(archived.failedLoginCount).toBe(0);
      expect(archived.lockedUntil).toBeNull();
    });
  }
);
