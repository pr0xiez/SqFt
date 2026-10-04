import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCustomerActivity } from "@/lib/repositories/customerActivityRepo";
import { createCustomer } from "@/lib/repositories/customerRepo";
import { searchLocations } from "@/lib/repositories/locationRepo";

// Integration test against the real database (skipped in CI's DB-less unit
// job, like the other repo integration suites).
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("customer hub repos", () => {
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const org = await prisma.organization.create({
      data: { name: "Hub Co", slug: `hub-${stamp}` },
    });
    const other = await prisma.organization.create({
      data: { name: "Other Co", slug: `hub-other-${stamp}` },
    });
    orgId = org.id;
    otherOrgId = other.id;
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [orgId, otherOrgId] } },
    });
  });

  it("createCustomer creates the first location in the same write", async () => {
    const c = await createCustomer(orgId, {
      name: "Rae Lindqvist",
      source: "phone",
      location: {
        street: "742 Evergreen Terrace",
        city: "Springfield",
        state: "OH",
        postalCode: "45501",
      },
    });
    expect(c.locations).toHaveLength(1);
    expect(c.locations[0].address).toBe(
      "742 Evergreen Terrace, Springfield, OH 45501"
    );
    const loc = await prisma.location.findFirstOrThrow({
      where: { id: c.locations[0].id },
    });
    expect(loc).toMatchObject({ orgId, customerId: c.id, city: "Springfield" });
  });

  it("createCustomer without an address creates no location", async () => {
    const c = await createCustomer(orgId, {
      name: "No Address",
      source: "phone",
    });
    expect(c.locations).toEqual([]);
  });

  it("searchLocations matches customer name or address, scoped to the org", async () => {
    await createCustomer(otherOrgId, {
      name: "Rae Elsewhere",
      source: "phone",
      location: {
        street: "1 Other Rd",
        city: "Dayton",
        state: "OH",
        postalCode: "45402",
      },
    });
    const byName = await searchLocations(orgId, "lindq");
    expect(byName.map((l) => l.customer.name)).toEqual(["Rae Lindqvist"]);
    const byAddress = await searchLocations(orgId, "evergreen");
    expect(byAddress).toHaveLength(1);
    expect(byAddress[0]._count.siteMeasures).toBe(0);
    expect(await searchLocations(orgId, "Other Rd")).toEqual([]);
  });

  it("getCustomerActivity returns the chain and scopes by org", async () => {
    const c = await createCustomer(orgId, {
      name: "Timeline Tess",
      source: "referral",
      location: {
        street: "9 Elm Ave",
        city: "Columbus",
        state: "OH",
        postalCode: "43201",
      },
    });
    const sm = await prisma.siteMeasure.create({
      data: { orgId, locationId: c.locations[0].id, siteMeasureNumber: 77001 },
    });
    const est = await prisma.estimate.create({
      data: {
        orgId,
        siteMeasureId: sm.id,
        estimateNumber: 77001,
        status: "approved",
        total: 1000,
        estimateEvents: {
          create: [
            { type: "sent", source: "builder", metadata: { to: "t@x.co" } },
            { type: "link_rotated", source: "builder" },
          ],
        },
      },
    });
    await prisma.invoice.create({
      data: {
        orgId,
        estimateId: est.id,
        invoiceNumber: 77001,
        amount: 300,
        status: "partial",
        payments: { create: [{ amount: 100, method: "check" }] },
        invoiceEvents: {
          create: [
            { type: "sent", source: "builder" },
            { type: "payment_recorded", source: "builder" },
          ],
        },
      },
    });
    // A job linked only through the estimate, and a visit linked directly.
    await prisma.event.create({
      data: {
        orgId,
        type: "job",
        title: "Install",
        estimateId: est.id,
        date: new Date("2026-10-12T00:00:00.000Z"),
        startTime: "08:00",
        endTime: "17:00",
      },
    });
    await prisma.event.create({
      data: {
        orgId,
        type: "visit",
        title: "Walkthrough",
        customerId: c.id,
        date: new Date("2026-10-02T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "10:00",
      },
    });

    const a = await getCustomerActivity(orgId, c.id);
    expect(a).not.toBeNull();
    expect(a?.siteMeasures).toEqual([
      expect.objectContaining({
        id: sm.id,
        address: "9 Elm Ave, Columbus, OH 43201",
      }),
    ]);
    expect(a?.estimates[0]).toMatchObject({
      id: est.id,
      total: 1000,
      siteMeasureId: sm.id,
    });
    // Bookkeeping events are filtered out; metadata is narrowed.
    expect(a?.estimates[0].events.map((e) => [e.type, e.to])).toEqual([
      ["sent", "t@x.co"],
    ]);
    expect(a?.invoices[0]).toMatchObject({
      estimateNumber: 77001,
      payments: [expect.objectContaining({ amount: 100, method: "check" })],
    });
    expect(a?.invoices[0].events.map((e) => e.type)).toEqual(["sent"]);
    expect(a?.events.map((e) => e.title)).toEqual(["Walkthrough", "Install"]);
    expect(a?.events[1].estimateNumber).toBe(77001);

    expect(await getCustomerActivity(otherOrgId, c.id)).toBeNull();
  });
});
