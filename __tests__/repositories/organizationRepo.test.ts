import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrgById } from "@/lib/repositories/organizationRepo";

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)(
  "organizationRepo.getOrgById",
  () => {
    let orgId: string;

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: "Org Repo Co", slug: `orgrepo-${Date.now()}` },
      });
      orgId = org.id;
    });
    afterAll(async () => {
      await prisma.organization.delete({ where: { id: orgId } });
    });

    it("returns the org summary for a real id", async () => {
      const org = await getOrgById(orgId);
      expect(org).not.toBeNull();
      expect(org?.name).toBe("Org Repo Co");
      expect(org?.slug).toContain("orgrepo-");
      expect(typeof org?.subscriptionStatus).toBe("string");
      expect(org?.createdAt).toBeInstanceOf(Date);
    });

    it("returns null for a missing id", async () => {
      expect(await getOrgById("does-not-exist")).toBeNull();
    });
  }
);
