import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createLocation,
  listLocationsForCustomer,
} from "@/lib/repositories/locationRepo";

// Integration test against the real database. Runs locally (DATABASE_URL is
// loaded from .env by vitest.setup.ts) and is skipped in CI's DB-less unit
// job, where database behavior is covered by the Playwright e2e suite instead.
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("locationRepo", () => {
  let orgId: string;
  let customerId: number;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "L Co", slug: `loc-${Date.now()}` },
    });
    orgId = org.id;
    const c = await prisma.customer.create({ data: { orgId, name: "Pat" } });
    customerId = c.id;
  });
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it("creates multiple locations for one customer and derives address", async () => {
    await createLocation({
      orgId,
      customerId,
      street: "12 Oak St",
      city: "Columbus",
      state: "OH",
      postalCode: "43201",
      label: "Rental",
    });
    await createLocation({
      orgId,
      customerId,
      street: "9 Elm Ave",
      city: "Dublin",
      state: "OH",
      postalCode: "43017",
    });
    const locs = await listLocationsForCustomer(orgId, customerId);
    expect(locs.map((l) => l.address).sort()).toEqual([
      "12 Oak St, Columbus, OH 43201",
      "9 Elm Ave, Dublin, OH 43017",
    ]);
  });

  it("returns null (creates nothing) when the customer is not in the org", async () => {
    const otherOrg = await prisma.organization.create({
      data: { name: "Other Co", slug: `other-${Date.now()}` },
    });
    try {
      const res = await createLocation({
        orgId: otherOrg.id,
        customerId,
        street: "999 Hijack Rd",
        city: "Columbus",
        state: "OH",
        postalCode: "43215",
      });
      expect(res).toBeNull();
      const leaked = await listLocationsForCustomer(otherOrg.id, customerId);
      expect(leaked).toHaveLength(0);
    } finally {
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    }
  });
});
