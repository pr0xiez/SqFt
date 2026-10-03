import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getOrgConnectOnboarding,
  setOrgConnectAccount,
  setOrgConnectStatus,
} from "@/lib/repositories/organizationRepo";

// The settings page reads `stripeConnectOnboardedAt !== null` as "this account
// has been active before" — the only thing telling a restriction on a once-live
// account (payments paused) from a new account Stripe calls restricted while
// onboarding. These pin the invariant that makes that read safe: every active
// write stamps it, nothing but attaching a new account clears it.

const seededOrgIds: string[] = [];

async function seedOrg() {
  const ts = `${Date.now()}-${Math.round(performance.now() * 1000)}`;
  const org = await prisma.organization.create({
    data: { name: "Connect Stamp Co", slug: `connect-stamp-${ts}` },
  });
  seededOrgIds.push(org.id);
  return org.id;
}

// Integration test against the real database. Runs locally (DATABASE_URL
// loaded from .env by vitest.setup.ts). Skipped in CI's DB-less unit job.
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)(
  "organizationRepo — Connect onboarding stamp",
  () => {
    afterAll(async () => {
      for (const id of seededOrgIds) {
        await prisma.organization.delete({ where: { id } }).catch(() => {});
      }
    });

    it("starts unstamped, and a restricted account mid-onboarding stays that way", async () => {
      const orgId = await seedOrg();
      expect(await getOrgConnectOnboarding(orgId)).toEqual({
        stripeConnectAccountId: null,
        stripeConnectOnboardedAt: null,
      });

      await setOrgConnectAccount(orgId, "acct_new", "pending");
      await setOrgConnectStatus(orgId, "restricted");

      expect(await getOrgConnectOnboarding(orgId)).toEqual({
        stripeConnectAccountId: "acct_new",
        stripeConnectOnboardedAt: null,
      });
    });

    it("stamps an active write even when the caller passes no date", async () => {
      // The checkout route caches a live "active" with no date; an activation
      // only it observed must still count.
      const orgId = await seedOrg();
      await setOrgConnectAccount(orgId, "acct_live", "pending");

      await setOrgConnectStatus(orgId, "active");

      const org = await getOrgConnectOnboarding(orgId);
      expect(org.stripeConnectOnboardedAt).toBeInstanceOf(Date);
    });

    it("records the activation time it is given", async () => {
      const orgId = await seedOrg();
      await setOrgConnectAccount(orgId, "acct_live", "pending");
      const at = new Date("2026-09-01T12:00:00Z");

      await setOrgConnectStatus(orgId, "active", at);

      const org = await getOrgConnectOnboarding(orgId);
      expect(org.stripeConnectOnboardedAt).toEqual(at);
    });

    it("never clears the stamp when a once-active account is restricted", async () => {
      const orgId = await seedOrg();
      await setOrgConnectAccount(orgId, "acct_live", "pending");
      await setOrgConnectStatus(orgId, "active");

      await setOrgConnectStatus(orgId, "restricted");
      await setOrgConnectStatus(orgId, "pending");

      const row = await prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { stripeConnectStatus: true, stripeConnectOnboardedAt: true },
      });
      expect(row.stripeConnectStatus).toBe("pending");
      expect(row.stripeConnectOnboardedAt).toBeInstanceOf(Date);
    });

    it("back-fills the stamp on an account already cached active without one", async () => {
      // Rows cached "active" by a caller that didn't stamp (the checkout route,
      // before every active write stamped) still need it.
      const orgId = await seedOrg();
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          stripeConnectAccountId: "acct_legacy",
          stripeConnectStatus: "active",
        },
      });

      await setOrgConnectStatus(orgId, "active");

      const org = await getOrgConnectOnboarding(orgId);
      expect(org.stripeConnectOnboardedAt).toBeInstanceOf(Date);
    });

    it("resets the stamp when a new account is attached", async () => {
      // The stamp describes the attached account: a fresh one has never been
      // active, and inheriting the old one's stamp would present its
      // onboarding as "payments paused".
      const orgId = await seedOrg();
      await setOrgConnectAccount(orgId, "acct_old", "pending");
      await setOrgConnectStatus(
        orgId,
        "active",
        new Date("2026-09-01T12:00:00Z")
      );
      const before = await getOrgConnectOnboarding(orgId);
      expect(before.stripeConnectOnboardedAt).toBeInstanceOf(Date);

      await setOrgConnectAccount(orgId, "acct_fresh", "pending");

      expect(await getOrgConnectOnboarding(orgId)).toEqual({
        stripeConnectAccountId: "acct_fresh",
        stripeConnectOnboardedAt: null,
      });
    });
  }
);
