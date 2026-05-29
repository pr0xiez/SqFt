import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createLocation,
  listLocationsForCustomer,
} from "@/lib/repositories/locationRepo";

describe("locationRepo", () => {
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

  it("creates multiple locations for one customer", async () => {
    await createLocation({
      orgId,
      customerId,
      address: "12 Oak St",
      label: "Rental",
    });
    await createLocation({ orgId, customerId, address: "9 Elm Ave" });
    const locs = await listLocationsForCustomer(orgId, customerId);
    expect(locs.map((l) => l.address).sort()).toEqual([
      "12 Oak St",
      "9 Elm Ave",
    ]);
  });
});
