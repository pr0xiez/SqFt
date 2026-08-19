/**
 * Seed script — populates the database with demo data matching the SqFt prototype
 * Run with: npx prisma db seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";
import { computeEstimateView, fromPrismaEstimate } from "../lib/estimateView";
import { locationAddressColumns } from "../lib/locations/formatAddress";
import { createOrganization } from "../lib/onboarding/createOrganization";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Shape aliases for the values phase functions below pass to each other —
// derived from the actual Prisma calls that produce them, so they track the
// schema instead of hand-maintained field lists.
type SeedOrg = Awaited<
  ReturnType<typeof prisma.organization.findUniqueOrThrow>
>;
type SeedUser = Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>;
type SeedCustomer = Awaited<ReturnType<typeof prisma.customer.create>>;
type SeedLocation = Awaited<ReturnType<typeof prisma.location.create>>;
type SeedSiteMeasure = Awaited<ReturnType<typeof prisma.siteMeasure.create>>;
type SeedEstimate = Awaited<ReturnType<typeof prisma.estimate.create>>;

/** Populate the denormalized Estimate.total on a seeded estimate, mirroring
 *  syncEstimateTotal in lib/repositories/estimateRepo.ts — null when there are
 *  no line items, else computeEstimateView(fromPrismaEstimate(...)).total. */
async function setEstimateTotal(estimateId: number) {
  const hydrated = await prisma.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    select: {
      markupPct: true,
      depositPct: true,
      lineItems: true,
      siteMeasure: { select: { items: true } },
    },
  });
  const total =
    hydrated.lineItems.length === 0
      ? null
      : computeEstimateView(fromPrismaEstimate(hydrated)).total;
  await prisma.estimate.update({ where: { id: estimateId }, data: { total } });
}

// ── Reset demo data so the seed is safely re-runnable ───────────────────────
// The seed populates demo orgs (johnson-flooring-demo, other-floors-demo)
// via `create`, not upsert, for child rows — estimates, line items, events,
// siteMeasures, etc. Without a wipe step, re-running duplicates everything and
// trips unique constraints (e.g. approvalToken). Clear the demo orgs' data
// first; deleting the customers cascades to Location → SiteMeasure →
// Estimate → LineItem/EstimateApproval/EstimateEvent and SiteMeasureItem
// rows automatically. This — not a `prisma.$transaction` wrapping the whole
// run — is the deliberate mechanism that makes the script idempotent; a
// single all-or-nothing transaction isn't needed on top of it.
async function wipeDemoData(): Promise<void> {
  const demoOrgSlugs = ["johnson-flooring-demo", "other-floors-demo"];
  const demoOrgs = await prisma.organization.findMany({
    where: { slug: { in: demoOrgSlugs } },
    select: { id: true },
  });
  if (demoOrgs.length > 0) {
    const demoOrgIds = demoOrgs.map((o) => o.id);
    await prisma.event.deleteMany({ where: { orgId: { in: demoOrgIds } } });
    await prisma.customer.deleteMany({ where: { orgId: { in: demoOrgIds } } });
    await prisma.lineItemTemplate.deleteMany({
      where: { orgId: { in: demoOrgIds } },
    });
    // Delete demo users so re-runs of the seed don't collide with the
    // EmailTakenError that createOrganization now raises.
    await prisma.user.deleteMany({ where: { orgId: { in: demoOrgIds } } });
    // Then delete the orgs themselves — cascades clean up any remaining
    // children. createOrganization will recreate them below.
    await prisma.organization.deleteMany({
      where: { id: { in: demoOrgIds } },
    });
    console.log(`  ✓ Cleared prior demo data (${demoOrgs.length} org(s))`);
  }
}

// ── Primary demo org ─────────────────────────────────────────────────────
// Create through the shared onboarding service so seed + production paths
// stay aligned. seed: "minimal" plants the 6 default line-item templates.
// Stripe Connect intentionally left unconfigured in seed data:
// stripeConnectAccountId/Status null → orgs show the "set up payments" CTA.
async function seedPrimaryOrg(): Promise<{ org: SeedOrg; user: SeedUser }> {
  const orgResult = await createOrganization({
    org: { name: "Johnson Flooring Co.", slug: "johnson-flooring-demo" },
    admin: {
      name: "Mike Johnson",
      email: "demo@sqft.dev",
      password: "demo1234",
    },
    billing: { kind: "manual" },
    seed: "minimal",
  });
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgResult.orgId },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: orgResult.adminUserId },
  });
  console.log(`  ✓ Org: ${org.name}`);
  console.log(`  ✓ User: ${user.email} / password: demo1234`);
  console.log("  ✓ 6 line item templates");
  return { org, user };
}

// ── Org-scoped users: crew (installers) + the fixed lead/crew/admin logins ──
async function seedOrgUsers(org: SeedOrg): Promise<{
  crewMike: SeedUser;
  crewCarlos: SeedUser;
  crewDave: SeedUser;
  crewSarah: SeedUser;
}> {
  const orgId = org.id;
  const crewPwd = await bcrypt.hash("demo1234", 10);
  const [crewMike, crewCarlos, crewDave, crewSarah] = await Promise.all([
    prisma.user.create({
      data: {
        orgId,
        name: "Mike",
        email: "mike@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Owner / Sales",
      },
    }),
    prisma.user.create({
      data: {
        orgId,
        name: "Carlos",
        email: "carlos@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Lead Installer",
      },
    }),
    prisma.user.create({
      data: {
        orgId,
        name: "Dave",
        email: "dave@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Installer",
      },
    }),
    prisma.user.create({
      data: {
        orgId,
        name: "Sarah",
        email: "sarah@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Showroom",
      },
    }),
  ]);
  console.log("  ✓ 4 crew users (mike/carlos/dave/sarah @sqft.dev / demo1234)");

  const leadHash = await bcrypt.hash("demo1234", 10);
  await prisma.user.upsert({
    where: { email: "lead@sqft.dev" },
    update: {},
    create: {
      name: "Marcus Chen",
      email: "lead@sqft.dev",
      password: leadHash,
      role: "lead",
      orgId,
    },
  });
  console.log("  ✓ User: lead@sqft.dev / password: demo1234");

  const crewHash = await bcrypt.hash("demo1234", 10);
  await prisma.user.upsert({
    where: { email: "crew@sqft.dev" },
    update: {},
    create: {
      name: "Diego Marín",
      email: "crew@sqft.dev",
      password: crewHash,
      role: "crew",
      orgId,
    },
  });
  console.log("  ✓ User: crew@sqft.dev / password: demo1234");

  // Super-admin user. Has the regular `admin` org role plus a cross-org
  // super-admin capability when its email is listed in SUPER_ADMIN_EMAILS
  // (see lib/auth/superAdmin.ts). Required to reach /admin/orgs.
  const superAdminHash = await bcrypt.hash("demo1234", 10);
  await prisma.user.upsert({
    where: { email: "admin@sqft.dev" },
    update: {},
    create: {
      name: "Sam Operator",
      email: "admin@sqft.dev",
      password: superAdminHash,
      role: "admin",
      orgId,
    },
  });
  console.log("  ✓ User: admin@sqft.dev / password: demo1234 (super-admin)");

  return { crewMike, crewCarlos, crewDave, crewSarah };
}

// ── Second demo org (tenant-isolation tests) ─────────────────────────────
async function seedSecondaryOrg(): Promise<void> {
  const otherResult = await createOrganization({
    org: { name: "Other Floors Co.", slug: "other-floors-demo" },
    admin: {
      name: "Other Owner",
      email: "demo2@sqft.dev",
      password: "demo1234",
    },
    billing: { kind: "manual" },
    seed: "none", // second demo org doesn't need the template defaults
  });
  const otherOrg = await prisma.organization.findUniqueOrThrow({
    where: { id: otherResult.orgId },
  });
  const otherUser = await prisma.user.findUniqueOrThrow({
    where: { id: otherResult.adminUserId },
  });
  console.log(`  ✓ Org: ${otherOrg.name}`);
  console.log(`  ✓ User: ${otherUser.email} / password: demo1234`);
}

// ── Customers (matching prototype data) ───────────────────────────────────
async function seedCustomersAndLocations(org: SeedOrg): Promise<{
  customers: SeedCustomer[];
  locations: SeedLocation[];
}> {
  const orgId = org.id;
  const customerData = [
    {
      name: "Henderson, J.",
      phone: "(614) 555-0142",
      email: "henderson@email.com",
      street: "1247 Elm St",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
      source: "phone",
      notes: "Prefers Mon mornings",
    },
    {
      name: "Martinez, R.",
      phone: "(614) 555-0188",
      email: "rmartinez@email.com",
      street: "89 Oak Ave",
      city: "Worthington",
      state: "OH",
      postalCode: "43085",
      source: "referral",
      notes: "Referred by Henderson",
    },
    {
      name: "Chen, L.",
      phone: "(614) 555-0211",
      email: "lchen@email.com",
      street: "142 Maple Dr",
      city: "Dublin",
      state: "OH",
      postalCode: "43017",
      source: "online",
      notes: "Wants to start ASAP",
    },
    {
      name: "Park Family",
      phone: "(614) 555-0307",
      email: "parkfamily@email.com",
      street: "218 Birch Ln",
      city: "Bexley",
      state: "OH",
      postalCode: "43209",
      source: "walkin",
      notes: "",
    },
    {
      name: "Nguyen, A.",
      phone: "(614) 555-0421",
      email: "",
      street: "33 Pine Ct",
      city: "Upper Arlington",
      state: "OH",
      postalCode: "43221",
      source: "website",
      notes: "New construction",
    },
    {
      name: "Sharma, P.",
      phone: "(614) 555-0509",
      email: "p.sharma@email.com",
      street: "67 Cedar Way",
      city: "Westerville",
      state: "OH",
      postalCode: "43081",
      source: "phone",
      notes: "",
    },
  ];

  const customers: SeedCustomer[] = [];
  // One Location per demo customer, created from the address string that used
  // to live on Customer. Site measures hang off these locations now.
  const locations: SeedLocation[] = [];
  for (const c of customerData) {
    const { street, city, state, postalCode, ...customerFields } = c;
    const customer = await prisma.customer.upsert({
      where: { id: customers.length + 1 },
      update: {},
      create: { ...customerFields, orgId },
    });
    customers.push(customer);
    const location = await prisma.location.create({
      data: {
        orgId,
        customerId: customer.id,
        ...locationAddressColumns({
          street,
          unit: "",
          city,
          state,
          postalCode,
        }),
      },
    });
    locations.push(location);
  }
  console.log(`  ✓ ${customers.length} customers`);
  console.log(`  ✓ ${locations.length} locations`);
  return { customers, locations };
}

// ── SiteMeasures (rooms only) ────────────────────────────────────────────────
// Each siteMeasure gets its org-wide siteMeasureNumber allocated explicitly here
// (the repository allocates from Organization.nextSiteMeasureNumber in app
// code; the seed sets it directly for stable demo numbers).
async function seedBaseSiteMeasures(
  org: SeedOrg,
  locations: SeedLocation[]
): Promise<{
  est1042: SeedSiteMeasure;
  est1043: SeedSiteMeasure;
  est1040: SeedSiteMeasure;
  est1041: SeedSiteMeasure;
}> {
  const orgId = org.id;
  // #1042 — Henderson — 3 rooms
  const est1042 = await prisma.siteMeasure.create({
    data: {
      orgId,
      locationId: locations[0].id,
      siteMeasureNumber: 1042,
      items: {
        create: [
          {
            type: "room",
            name: "Living Room",
            shape: "rect",
            w: 18,
            l: 14,
            note: "",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Master Bedroom",
            shape: "rect",
            w: 15,
            l: 13,
            note: "",
            sortOrder: 1,
          },
          {
            type: "room",
            name: "Hallway",
            shape: "rect",
            w: 12,
            l: 4,
            note: "narrow at door",
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // #1043 — Sharma — Tile, 2 rooms
  const est1043 = await prisma.siteMeasure.create({
    data: {
      orgId,
      locationId: locations[5].id,
      siteMeasureNumber: 1043,
      items: {
        create: [
          {
            type: "room",
            name: "Master Bath",
            shape: "rect",
            w: 10,
            l: 8,
            note: "",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Powder",
            shape: "rect",
            w: 6,
            l: 5,
            note: "",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // #1044 — Park — Living + Dining, L-shape
  const _est1044 = await prisma.siteMeasure.create({
    data: {
      orgId,
      locationId: locations[3].id,
      siteMeasureNumber: 1044,
      items: {
        create: [
          {
            // Multi-box room: an L-shape decomposed into two rectangles.
            // Canonical form per saveSiteMeasure: segments set, scalars null.
            type: "room",
            name: "Living + Dining",
            shape: "rect",
            w: null,
            l: null,
            segments: [
              { w: 14, l: 22 },
              { w: 8, l: 10 },
            ],
            note: "open concept, L-shape",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // #1045 — Nguyen — empty (new lead)
  const _est1045 = await prisma.siteMeasure.create({
    data: {
      orgId,
      locationId: locations[4].id,
      siteMeasureNumber: 1045,
    },
  });

  // #1040 — Chen — Staircase
  const est1040 = await prisma.siteMeasure.create({
    data: {
      orgId,
      locationId: locations[2].id,
      siteMeasureNumber: 1040,
      items: {
        create: [
          {
            type: "room",
            name: "Main Staircase",
            shape: "rect",
            w: 14,
            l: 3,
            note: "13 risers · LVP wrap",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Upper Landing",
            shape: "rect",
            w: 8,
            l: 6,
            note: "",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // #1041 — Martinez — Hardwood, 3 rooms
  const est1041 = await prisma.siteMeasure.create({
    data: {
      orgId,
      locationId: locations[1].id,
      siteMeasureNumber: 1041,
      items: {
        create: [
          {
            type: "room",
            name: "Living Room",
            shape: "rect",
            w: 20,
            l: 16,
            note: "Hardwood — oak select",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Dining Room",
            shape: "rect",
            w: 14,
            l: 12,
            note: "",
            sortOrder: 1,
          },
          {
            type: "room",
            name: "Front Hall",
            shape: "rect",
            w: 10,
            l: 5,
            note: "",
            sortOrder: 2,
          },
        ],
      },
    },
  });
  console.log("  ✓ 6 siteMeasures (base set)");

  return { est1042, est1043, est1040, est1041 };
}

// ── Estimates ────────────────────────────────────────────────────────────────
async function seedCoreEstimates(
  org: SeedOrg,
  user: SeedUser,
  siteMeasures: {
    est1042: SeedSiteMeasure;
    est1043: SeedSiteMeasure;
    est1040: SeedSiteMeasure;
    est1041: SeedSiteMeasure;
  }
): Promise<{
  q5001: SeedEstimate;
  q5002: SeedEstimate;
  q5003: SeedEstimate;
  q5004: SeedEstimate;
}> {
  const orgId = org.id;
  const { est1042, est1043, est1040, est1041 } = siteMeasures;

  // #5001 — Henderson LVP (sent)
  const q5001 = await prisma.estimate.create({
    data: {
      orgId,
      siteMeasureId: est1042.id,
      estimateNumber: 5001,
      status: "sent",
      markupPct: 35,
      depositPct: 0.5,
      lineItems: {
        create: [
          {
            name: "LVP — Mohawk RevWood",
            rate: 4.85,
            qtyMode: "linked_area",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
          {
            name: "Underlayment — 6 mil",
            rate: 0.45,
            qtyMode: "linked_area",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 1,
          },
          {
            name: "Removal of carpet",
            rate: 1.2,
            qtyMode: "linked_area",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 2,
          },
          {
            name: "Floor prep & leveling",
            rate: 0.65,
            qtyMode: "manual",
            qty: 495,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 3,
          },
          {
            name: "Quarter round trim",
            rate: 2.5,
            qtyMode: "manual",
            qty: 180,
            unitLabel: "lf",
            linkedRoomIds: [],
            sortOrder: 4,
          },
          {
            name: "Haul away & disposal",
            rate: 185.0,
            qtyMode: "manual",
            qty: 1,
            unitLabel: "job",
            linkedRoomIds: [],
            sortOrder: 5,
          },
        ],
      },
    },
  });

  // #5002 — Martinez HW (approved) — winning estimate, drives the job event
  const q5002 = await prisma.estimate.create({
    data: {
      orgId,
      siteMeasureId: est1041.id,
      estimateNumber: 5002,
      status: "approved",
      markupPct: 35,
      depositPct: 0.5,
      approvalToken: "seed-token-q5002-cccccccccccccccccccccccc",
      sentAt: new Date("2026-04-20T15:00:00Z"),
      sentToEmail: "rmartinez@email.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-04-21T09:30:00Z"),
      approvedAt: new Date("2026-04-21T17:42:00Z"),
      lineItems: {
        create: [
          {
            name: "White oak — select grade",
            rate: 7.2,
            qtyMode: "linked_area",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
          {
            name: "Hardwood install — nail down",
            rate: 3.8,
            qtyMode: "linked_area",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 1,
          },
          {
            name: "Sand & finish — 3 coats",
            rate: 2.4,
            qtyMode: "linked_area",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // #5003 — Chen Staircase (accepted) — winning estimate, drives the job events
  const q5003 = await prisma.estimate.create({
    data: {
      orgId,
      siteMeasureId: est1040.id,
      estimateNumber: 5003,
      status: "approved",
      markupPct: 35,
      depositPct: 0.5,
      approvalToken: "seed-token-q5003-dddddddddddddddddddddddd",
      sentAt: new Date("2026-04-18T13:15:00Z"),
      sentToEmail: "lchen@email.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-04-18T20:05:00Z"),
      approvedAt: new Date("2026-04-19T08:21:00Z"),
      lineItems: {
        create: [
          {
            name: "LVP stair wrap kit",
            rate: 48.0,
            qtyMode: "manual",
            qty: 13,
            unitLabel: "tread",
            linkedRoomIds: [],
            sortOrder: 0,
          },
          {
            name: "Stair install labor",
            rate: 65.0,
            qtyMode: "manual",
            qty: 13,
            unitLabel: "tread",
            linkedRoomIds: [],
            sortOrder: 1,
          },
          {
            name: "Landing — LVP",
            rate: 4.85,
            qtyMode: "linked_area",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // Approval + approve-flow events for the two winning estimates above. The app
  // only flips an estimate to `approved` inside `approveEstimateByToken`, which
  // writes an EstimateApproval in the same transaction — so approved estimates in
  // seed data need a matching approval to preserve that invariant.
  await prisma.estimateApproval.create({
    data: {
      estimateId: q5002.id,
      approvedAt: new Date("2026-04-21T17:42:00Z"),
      ip: "198.51.100.22",
      userAgent: "Mozilla/5.0 (seed fixture)",
      snapshot: {
        estimateNumber: q5002.estimateNumber,
        seedFixture: true,
      },
    },
  });
  for (const evt of [
    {
      type: "sent",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
      createdAt: new Date("2026-04-20T15:00:00Z"),
      ip: null as string | null,
      userAgent: null as string | null,
    },
    {
      type: "viewed",
      source: "builder",
      actorEmail: null,
      actorName: null,
      createdAt: new Date("2026-04-21T09:30:00Z"),
      ip: "198.51.100.22",
      userAgent: "Mozilla/5.0 (seed fixture)",
    },
    {
      type: "approved",
      source: "customer",
      actorEmail: "rmartinez@email.com",
      actorName: "Roberto Martinez",
      createdAt: new Date("2026-04-21T17:42:00Z"),
      ip: "198.51.100.22",
      userAgent: "Mozilla/5.0 (seed fixture)",
    },
  ] as const) {
    await prisma.estimateEvent.create({
      data: {
        estimateId: q5002.id,
        type: evt.type,
        source: evt.source,
        actorEmail: evt.actorEmail,
        actorName: evt.actorName,
        ip: evt.ip,
        userAgent: evt.userAgent,
        createdAt: evt.createdAt,
      },
    });
  }

  await prisma.estimateApproval.create({
    data: {
      estimateId: q5003.id,
      approvedAt: new Date("2026-04-19T08:21:00Z"),
      ip: "198.51.100.51",
      userAgent: "Mozilla/5.0 (seed fixture)",
      snapshot: {
        estimateNumber: q5003.estimateNumber,
        seedFixture: true,
      },
    },
  });
  for (const evt of [
    {
      type: "sent",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
      createdAt: new Date("2026-04-18T13:15:00Z"),
      ip: null as string | null,
      userAgent: null as string | null,
    },
    {
      type: "viewed",
      source: "builder",
      actorEmail: null,
      actorName: null,
      createdAt: new Date("2026-04-18T20:05:00Z"),
      ip: "198.51.100.51",
      userAgent: "Mozilla/5.0 (seed fixture)",
    },
    {
      type: "approved",
      source: "customer",
      actorEmail: "lchen@email.com",
      actorName: "Linda Chen",
      createdAt: new Date("2026-04-19T08:21:00Z"),
      ip: "198.51.100.51",
      userAgent: "Mozilla/5.0 (seed fixture)",
    },
  ] as const) {
    await prisma.estimateEvent.create({
      data: {
        estimateId: q5003.id,
        type: evt.type,
        source: evt.source,
        actorEmail: evt.actorEmail,
        actorName: evt.actorName,
        ip: evt.ip,
        userAgent: evt.userAgent,
        createdAt: evt.createdAt,
      },
    });
  }

  // #5004 — Sharma Tile (draft)
  const q5004 = await prisma.estimate.create({
    data: {
      orgId,
      siteMeasureId: est1043.id,
      estimateNumber: 5004,
      status: "draft",
      markupPct: 35,
      depositPct: 0.5,
      lineItems: {
        create: [
          {
            name: "Porcelain tile 12×24",
            rate: 5.4,
            qtyMode: "linked_area",
            wastePct: 15,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Park (#1044) gets no estimate yet — demonstrates "no estimates yet" empty state
  // Nguyen (#1045) is a brand-new lead with no rooms and no estimate

  return { q5001, q5002, q5003, q5004 };
}

// ── Sent estimate: emailed but not yet viewed ────────────────────────────────
async function seedSentEstimate(
  org: SeedOrg,
  user: SeedUser,
  est1042: SeedSiteMeasure
): Promise<{ sentEstimate: SeedEstimate }> {
  const sentEstimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: est1042.id,
      estimateNumber: 5005,
      status: "sent",
      markupPct: 0,
      depositPct: 0.5,
      approvalToken: "seed-token-sent-estimate-aaaaaaaaaaaaaaaaaaaa",
      sentAt: new Date("2026-05-08T15:30:00Z"),
      sentToEmail: "buyer@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      lineItems: {
        create: [
          {
            name: "LVP install",
            rate: 4.85,
            qtyMode: "manual",
            qty: 545,
            unitLabel: "ft²",
            sortOrder: 0,
          },
        ],
      },
    },
  });
  await prisma.estimateEvent.create({
    data: {
      estimateId: sentEstimate.id,
      type: "sent",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
      metadata: {
        to: "buyer@example.com",
        subject: `Estimate #${sentEstimate.estimateNumber} from ${org.name}`,
      },
    },
  });
  console.log(`  ✓ Sent estimate: #${sentEstimate.estimateNumber}`);
  return { sentEstimate };
}

// ── Accepted estimate: signed by customer ────────────────────────────────────
async function seedAcceptedEstimate(
  org: SeedOrg,
  user: SeedUser,
  est1042: SeedSiteMeasure
): Promise<{ acceptedEstimate: SeedEstimate }> {
  const acceptedEstimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: est1042.id,
      estimateNumber: 5006,
      status: "approved",
      markupPct: 0,
      depositPct: 0.5,
      approvalToken: "seed-token-accepted-estimate-bbbbbbbbbbbbbbbb",
      sentAt: new Date("2026-05-01T14:00:00Z"),
      sentToEmail: "henderson@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-05-01T16:12:00Z"),
      approvedAt: new Date("2026-05-02T10:45:00Z"),
      lineItems: {
        create: [
          {
            name: "LVP install",
            rate: 4.85,
            qtyMode: "manual",
            qty: 545,
            unitLabel: "ft²",
            sortOrder: 0,
          },
          {
            name: "Underlayment",
            rate: 0.45,
            qtyMode: "manual",
            qty: 495,
            unitLabel: "ft²",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await prisma.estimateApproval.create({
    data: {
      estimateId: acceptedEstimate.id,
      approvedAt: new Date("2026-05-02T10:45:00Z"),
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0 (seed fixture)",
      snapshot: {
        estimateNumber: acceptedEstimate.estimateNumber,
        seedFixture: true,
      },
    },
  });
  for (const evt of [
    {
      type: "sent",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
      createdAt: new Date("2026-05-01T14:00:00Z"),
    },
    {
      type: "viewed",
      source: "builder",
      actorEmail: null,
      actorName: null,
      createdAt: new Date("2026-05-01T16:12:00Z"),
    },
    {
      type: "approved",
      source: "customer",
      actorEmail: "henderson@example.com",
      actorName: "Janet Henderson",
      createdAt: new Date("2026-05-02T10:45:00Z"),
    },
  ] as const) {
    await prisma.estimateEvent.create({
      data: {
        estimateId: acceptedEstimate.id,
        type: evt.type,
        source: evt.source,
        actorEmail: evt.actorEmail,
        actorName: evt.actorName,
        ip:
          evt.type === "viewed" || evt.type === "approved"
            ? "203.0.113.42"
            : null,
        userAgent:
          evt.type === "viewed" || evt.type === "approved"
            ? "Mozilla/5.0 (seed fixture)"
            : null,
        createdAt: evt.createdAt,
      },
    });
  }
  console.log(`  ✓ Accepted estimate: #${acceptedEstimate.estimateNumber}`);
  return { acceptedEstimate };
}

// ── Invoices on the accepted estimate (#5006) ────────────────────────────
// Demonstrates staged billing: a paid 50% deposit, a partially-paid progress
// invoice, and one voided draft. amounts are illustrative dollar figures.
async function seedInvoicesForAcceptedEstimate(
  org: SeedOrg,
  user: SeedUser,
  acceptedEstimate: SeedEstimate
): Promise<void> {
  const depositInvoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: acceptedEstimate.id,
      invoiceNumber: 1,
      status: "paid",
      amount: 1322.66,
      pct: 0.5,
      memo: "Deposit",
      terms: "50% to schedule, bal upon compl",
      coverNote:
        "Your deposit invoice is attached. Please remit at your earliest convenience.",
      paymentInstructions:
        "WARNING! We only accept credit cards through our payment link, or a check mailed to 127 S Main St., Monroe, OH 45050.",
      dueDate: new Date("2026-05-04T00:00:00Z"),
      publicToken: "seed-token-invoice-deposit-1111111111111111",
      sentAt: new Date("2026-05-02T12:00:00Z"),
      sentToEmail: "henderson@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      paidAt: new Date("2026-05-03T09:00:00Z"),
      snapshot: { invoiceNumber: 1, seedFixture: true },
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: depositInvoice.id,
      amount: 1322.66,
      method: "check",
      paidAt: new Date("2026-05-03T09:00:00Z"),
      reference: "Check #1042",
      recordedByEmail: user.email,
      recordedByName: user.name,
    },
  });
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: depositInvoice.id,
      type: "sent",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
    },
  });

  const progressInvoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: acceptedEstimate.id,
      invoiceNumber: 2,
      status: "partial",
      amount: 661.33,
      pct: 0.25,
      memo: "Progress payment",
      terms: "Net 15",
      paymentInstructions: "Check or card via payment link.",
      dueDate: new Date("2026-05-20T00:00:00Z"),
      publicToken: "seed-token-invoice-progress-2222222222222222",
      sentAt: new Date("2026-05-10T12:00:00Z"),
      sentToEmail: "henderson@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      snapshot: { invoiceNumber: 2, seedFixture: true },
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: progressInvoice.id,
      amount: 300,
      method: "cash",
      paidAt: new Date("2026-05-12T09:00:00Z"),
      recordedByEmail: user.email,
      recordedByName: user.name,
    },
  });

  await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: acceptedEstimate.id,
      invoiceNumber: 3,
      status: "void",
      amount: 100,
      memo: "Mistaken draft",
      voidedAt: new Date("2026-05-11T00:00:00Z"),
    },
  });
  console.log("  ✓ 3 invoices on #5006 (paid deposit, partial progress, void)");
}

// ── Second location for Henderson (a customer with two locations) ─────────
// Demonstrates the Customer → Location → SiteMeasure hierarchy: one customer
// owns multiple physical sites.
async function seedHendersonMultiSite(
  org: SeedOrg,
  customers: SeedCustomer[],
  locations: SeedLocation[]
): Promise<{ est1046: SeedSiteMeasure; est1047: SeedSiteMeasure }> {
  const rentalParts = {
    street: "456 Rental Rd",
    unit: "",
    city: "Columbus",
    state: "OH",
    postalCode: "43204",
  };
  const hendersonRental = await prisma.location.create({
    data: {
      orgId: org.id,
      customerId: customers[0].id,
      ...locationAddressColumns(rentalParts),
      label: "Rental Unit",
      notes: "Tenant-occupied — call ahead",
    },
  });

  // Second site measure under Henderson's PRIMARY location (locations[0]),
  // so that location has two site measures (#1042 above + #1046 here).
  const est1046 = await prisma.siteMeasure.create({
    data: {
      orgId: org.id,
      locationId: locations[0].id,
      siteMeasureNumber: 1046,
      items: {
        create: [
          {
            type: "room",
            name: "Basement",
            shape: "rect",
            w: 24,
            l: 20,
            note: "egress window wall",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Site measure at the rental unit — carries the declined/revision chain below.
  const est1047 = await prisma.siteMeasure.create({
    data: {
      orgId: org.id,
      locationId: hendersonRental.id,
      siteMeasureNumber: 1047,
      items: {
        create: [
          {
            type: "room",
            name: "Unit Kitchen",
            shape: "rect",
            w: 12,
            l: 10,
            note: "",
            sortOrder: 0,
          },
        ],
      },
    },
  });
  console.log("  ✓ +1 location, +2 site measures (Henderson multi-site)");
  return { est1046, est1047 };
}

// ── Viewed estimate: opened by the customer, not yet approved or declined ──
async function seedViewedEstimate(
  org: SeedOrg,
  user: SeedUser,
  est1046: SeedSiteMeasure
): Promise<{ viewedEstimate: SeedEstimate }> {
  const viewedEstimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: est1046.id,
      estimateNumber: 5007,
      status: "viewed",
      markupPct: 30,
      depositPct: 0.5,
      approvalToken: "seed-token-viewed-estimate-eeeeeeeeeeeeeeee",
      sentAt: new Date("2026-05-10T13:00:00Z"),
      sentToEmail: "henderson@email.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-05-10T18:20:00Z"),
      lineItems: {
        create: [
          {
            name: "LVP — basement grade",
            rate: 3.95,
            qtyMode: "linked_area",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    },
  });
  for (const evt of [
    {
      type: "sent",
      source: "builder",
      createdAt: new Date("2026-05-10T13:00:00Z"),
    },
    {
      type: "viewed",
      source: "builder",
      createdAt: new Date("2026-05-10T18:20:00Z"),
    },
  ] as const) {
    await prisma.estimateEvent.create({
      data: {
        estimateId: viewedEstimate.id,
        type: evt.type,
        source: evt.source,
        ip: evt.type === "viewed" ? "198.51.100.77" : null,
        userAgent: evt.type === "viewed" ? "Mozilla/5.0 (seed fixture)" : null,
        createdAt: evt.createdAt,
      },
    });
  }
  console.log(`  ✓ Viewed estimate: #${viewedEstimate.estimateNumber}`);
  return { viewedEstimate };
}

// ── Declined estimate + its revision (a revision chain) ───────────────────
// The customer declined #5008; the builder revised it into a fresh draft
// #5009 via `revisedFromId`, preserving the lineage.
async function seedDeclinedAndRevisedEstimate(
  org: SeedOrg,
  user: SeedUser,
  est1047: SeedSiteMeasure
): Promise<{ declinedEstimate: SeedEstimate; revisedEstimate: SeedEstimate }> {
  const declinedEstimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: est1047.id,
      estimateNumber: 5008,
      status: "declined",
      markupPct: 40,
      depositPct: 0.5,
      approvalToken: "seed-token-declined-estimate-ffffffffffffffff",
      sentAt: new Date("2026-05-05T11:00:00Z"),
      sentToEmail: "henderson@email.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-05-05T15:30:00Z"),
      declinedAt: new Date("2026-05-06T09:10:00Z"),
      declineReason: "Over budget — asked for a revised quote",
      lineItems: {
        create: [
          {
            name: "Premium LVP — Coretec",
            rate: 6.25,
            qtyMode: "linked_area",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    },
  });
  for (const evt of [
    {
      type: "sent",
      source: "builder",
      createdAt: new Date("2026-05-05T11:00:00Z"),
    },
    {
      type: "viewed",
      source: "builder",
      createdAt: new Date("2026-05-05T15:30:00Z"),
    },
    {
      type: "declined",
      source: "customer",
      createdAt: new Date("2026-05-06T09:10:00Z"),
    },
  ] as const) {
    await prisma.estimateEvent.create({
      data: {
        estimateId: declinedEstimate.id,
        type: evt.type,
        source: evt.source,
        actorEmail: evt.type === "declined" ? "henderson@email.com" : null,
        actorName: evt.type === "declined" ? "Janet Henderson" : null,
        ip:
          evt.type === "viewed" || evt.type === "declined"
            ? "198.51.100.77"
            : null,
        userAgent:
          evt.type === "viewed" || evt.type === "declined"
            ? "Mozilla/5.0 (seed fixture)"
            : null,
        createdAt: evt.createdAt,
      },
    });
  }

  // The revised draft, cloned from the declined estimate. Cheaper materials.
  const revisedEstimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: est1047.id,
      estimateNumber: 5009,
      status: "draft",
      markupPct: 30,
      depositPct: 0.5,
      revisedFromId: declinedEstimate.id,
      lineItems: {
        create: [
          {
            name: "LVP — value grade",
            rate: 4.1,
            qtyMode: "linked_area",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    },
  });
  await prisma.estimateEvent.create({
    data: {
      estimateId: revisedEstimate.id,
      type: "revised_from",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
      metadata: {
        revisedFromEstimateId: declinedEstimate.id,
        revisedFromEstimateNumber: declinedEstimate.estimateNumber,
      },
    },
  });
  console.log(
    `  ✓ Declined estimate #${declinedEstimate.estimateNumber} → revised draft #${revisedEstimate.estimateNumber}`
  );
  return { declinedEstimate, revisedEstimate };
}

// ── Bulk pagination fixtures ──────────────────────────────────────────────
// The hand-authored records above (6 customers / 9 estimates / 8 site
// measures) all fit on a single page, so they can't exercise the server-side
// pagination, facet counts, or sorting added in this branch. Generate a large
// batch of additional records that:
//   • exceeds every PER_PAGE_OPTIONS value (25/50/100) so multiple pages exist
//     for all three list views at any page size,
//   • cycles customer `source` across all five values (facet: source:*),
//   • cycles estimate `status` across all five values (estimate status facet
//     + customer pipeline:open/accepted facet), and
//   • spreads site measures across the empty / measured / estimated buckets
//     (site-measure status facet).
// Continues the org-wide number sequences from where the base set left off.
async function seedBulkFixtures(
  org: SeedOrg,
  user: SeedUser
): Promise<{
  nextSiteMeasureNumber: number;
  nextEstimateNumber: number;
  bulkEstimateIds: number[];
}> {
  const orgId = org.id;
  const SOURCES = ["phone", "online", "referral", "walkin", "website"] as const;
  const STATUSES = ["draft", "sent", "viewed", "approved", "declined"] as const;
  const BULK_COUNT = 120;

  // Continue the siteMeasureNumber / estimateNumber sequences after the base
  // set (which ends at 1047 / 5009). These are bumped onto the org counters at
  // the end so app-created records start fresh.
  let nextSiteMeasureNumber = 1048;
  let nextEstimateNumber = 5010;
  const bulkEstimateIds: number[] = [];
  let emptyCount = 0;
  let measuredCount = 0;
  let estimatedCount = 0;

  for (let i = 0; i < BULK_COUNT; i++) {
    const source = SOURCES[i % SOURCES.length];
    const seq = String(i + 1).padStart(3, "0");
    const customer = await prisma.customer.create({
      data: {
        orgId,
        name: `Pagination Customer ${seq}`,
        phone: `(614) 700-${seq}0`,
        email: `pagination${seq}@example.com`,
        source,
        notes: i % 4 === 0 ? "Bulk pagination fixture" : "",
      },
    });
    const pgParts = {
      street: `${1000 + i} Pagination Way`,
      unit: "",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
    };
    const location = await prisma.location.create({
      data: {
        orgId,
        customerId: customer.id,
        ...locationAddressColumns(pgParts),
      },
    });

    // Bucket selection: 1-in-6 empty, 1-in-6 measured (rooms, no estimate),
    // the rest estimated (rooms + an estimate).
    const bucket =
      i % 6 === 0 ? "empty" : i % 6 === 1 ? "measured" : "estimated";
    const siteMeasure = await prisma.siteMeasure.create({
      data: {
        orgId,
        locationId: location.id,
        siteMeasureNumber: nextSiteMeasureNumber++,
        items:
          bucket === "empty"
            ? undefined
            : {
                create: [
                  {
                    type: "room",
                    name: "Main Room",
                    shape: "rect",
                    w: 12 + (i % 8),
                    l: 10 + (i % 6),
                    note: "",
                    sortOrder: 0,
                  },
                ],
              },
      },
    });

    if (bucket === "empty") {
      emptyCount++;
      continue;
    }
    if (bucket === "measured") {
      measuredCount++;
      continue;
    }
    estimatedCount++;

    // Estimated bucket: attach one estimate, cycling status across all five.
    const status = STATUSES[i % STATUSES.length];
    const estimateNumber = nextEstimateNumber++;
    const sentAt = status === "draft" ? null : new Date("2026-05-15T12:00:00Z");
    const viewedAt =
      status === "viewed" || status === "approved" || status === "declined"
        ? new Date("2026-05-16T12:00:00Z")
        : null;
    const approvedAt =
      status === "approved" ? new Date("2026-05-17T12:00:00Z") : null;
    const declinedAt =
      status === "declined" ? new Date("2026-05-17T12:00:00Z") : null;

    const estimate = await prisma.estimate.create({
      data: {
        orgId,
        siteMeasureId: siteMeasure.id,
        estimateNumber,
        status,
        markupPct: 35,
        depositPct: 0.5,
        // Non-draft estimates were "sent", so they carry a (unique) token + the
        // relevant timestamps; drafts carry none.
        approvalToken:
          status === "draft" ? null : `seed-bulk-token-${estimateNumber}`,
        sentAt,
        sentToEmail: status === "draft" ? null : customer.email,
        sentByEmail: status === "draft" ? null : user.email,
        sentByName: status === "draft" ? null : user.name,
        viewedAt,
        approvedAt,
        declinedAt,
        declineReason: status === "declined" ? "Bulk fixture — declined" : null,
        lineItems: {
          create: [
            {
              name: "LVP install",
              rate: 4.85,
              qtyMode: "linked_area",
              wastePct: 10,
              unitLabel: "sqft",
              linkedRoomIds: [],
              sortOrder: 0,
            },
            {
              name: "Floor prep",
              rate: 0.65,
              qtyMode: "manual",
              qty: 200 + i,
              unitLabel: "sqft",
              linkedRoomIds: [],
              sortOrder: 1,
            },
          ],
        },
      },
    });

    // Approved estimates only ever reach that state via approveEstimateByToken,
    // which writes an EstimateApproval in the same transaction. Preserve that
    // invariant for the seeded approved records (mirrors the base set above).
    if (status === "approved") {
      await prisma.estimateApproval.create({
        data: {
          estimateId: estimate.id,
          approvedAt: approvedAt ?? new Date("2026-05-17T12:00:00Z"),
          ip: "203.0.113.10",
          userAgent: "Mozilla/5.0 (seed fixture)",
          snapshot: { estimateNumber, seedFixture: true },
        },
      });
    }

    bulkEstimateIds.push(estimate.id);
  }
  console.log(
    `  ✓ ${BULK_COUNT} bulk customers/locations/site measures ` +
      `(${emptyCount} empty, ${measuredCount} measured, ${estimatedCount} estimated)`
  );
  console.log(`  ✓ ${bulkEstimateIds.length} bulk estimates`);

  return { nextSiteMeasureNumber, nextEstimateNumber, bulkEstimateIds };
}

// Populate the denormalized Estimate.total on every seeded estimate, so the
// list view's total column / sort has data without a separate backfill. Run
// concurrently rather than as a serial await-in-a-loop — these are
// independent reads+writes keyed by id, so there's no ordering dependency
// between them.
async function backfillEstimateTotals(estimateIds: number[]): Promise<void> {
  await Promise.all(estimateIds.map((id) => setEstimateTotal(id)));
  console.log("  ✓ Estimate.total populated");
}

// Bump the org counters past every seeded value (base set + bulk fixtures) so
// newly created records start fresh sequences.
async function bumpOrgCounters(
  org: SeedOrg,
  nextSiteMeasureNumber: number,
  nextEstimateNumber: number,
  totalEstimateCount: number
): Promise<void> {
  await prisma.organization.update({
    where: { id: org.id },
    data: { nextSiteMeasureNumber, nextEstimateNumber, nextInvoiceNumber: 4 },
  });
  console.log(`  ✓ ${totalEstimateCount} estimates`);
}

// ── Calendar events ───────────────────────────────────────────────────────
async function seedCalendarEvents(
  org: SeedOrg,
  customers: SeedCustomer[],
  crew: {
    crewMike: SeedUser;
    crewCarlos: SeedUser;
    crewDave: SeedUser;
    crewSarah: SeedUser;
  },
  estimates: {
    q5001: SeedEstimate;
    q5002: SeedEstimate;
    q5003: SeedEstimate;
    q5004: SeedEstimate;
  }
): Promise<void> {
  const orgId = org.id;
  const { crewMike, crewCarlos, crewDave, crewSarah } = crew;
  const { q5001, q5002, q5003, q5004 } = estimates;
  const today = new Date();
  const d = (offsetDays: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };

  await Promise.all([
    prisma.event.create({
      data: {
        orgId,
        type: "job",
        title: "Chen Staircase · Day 2",
        customerId: customers[2].id,
        estimateId: q5003.id,
        date: d(0),
        startTime: "08:00",
        endTime: "16:00",
        notes: "",
        assignees: { connect: [{ id: crewCarlos.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "job",
        title: "Williams Tile Bath · Day 1",
        customerId: customers[5].id,
        estimateId: q5004.id,
        date: d(0),
        startTime: "08:30",
        endTime: "15:30",
        notes: "",
        assignees: { connect: [{ id: crewDave.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "visit",
        title: "Measure — Nguyen Residence",
        customerId: customers[4].id,
        date: d(0),
        startTime: "10:00",
        endTime: "11:00",
        notes: "",
        assignees: { connect: [{ id: crewMike.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "other",
        title: "Showroom — Park Family",
        customerId: customers[3].id,
        date: d(0),
        startTime: "14:00",
        endTime: "15:00",
        notes: "Material selection",
        assignees: { connect: [{ id: crewSarah.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "job",
        title: "Chen Staircase · Day 3",
        customerId: customers[2].id,
        estimateId: q5003.id,
        date: d(1),
        startTime: "08:00",
        endTime: "15:00",
        notes: "",
        assignees: {
          connect: [{ id: crewCarlos.id }, { id: crewDave.id }],
        },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "job",
        title: "Martinez HW",
        customerId: customers[1].id,
        estimateId: q5002.id,
        date: d(3),
        startTime: "08:00",
        endTime: "16:00",
        notes: "",
        assignees: { connect: [{ id: crewCarlos.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "visit",
        title: "Henderson follow-up",
        customerId: customers[0].id,
        date: d(4),
        startTime: "10:00",
        endTime: "11:00",
        notes: "",
        assignees: { connect: [{ id: crewMike.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId,
        type: "job",
        title: "Henderson — Floor install",
        customerId: customers[0].id,
        estimateId: q5001.id,
        date: d(6),
        startTime: "08:00",
        endTime: "16:00",
        notes: "",
        assignees: { connect: [{ id: crewCarlos.id }] },
      },
    }),
  ]);
  console.log("  ✓ 8 calendar events");
}

async function main() {
  console.log("🌱 Seeding demo data…");

  await wipeDemoData();

  const { org, user } = await seedPrimaryOrg();
  const crew = await seedOrgUsers(org);
  await seedSecondaryOrg();

  const { customers, locations } = await seedCustomersAndLocations(org);
  const siteMeasures = await seedBaseSiteMeasures(org, locations);

  const { q5001, q5002, q5003, q5004 } = await seedCoreEstimates(
    org,
    user,
    siteMeasures
  );
  const { sentEstimate } = await seedSentEstimate(
    org,
    user,
    siteMeasures.est1042
  );
  const { acceptedEstimate } = await seedAcceptedEstimate(
    org,
    user,
    siteMeasures.est1042
  );
  await seedInvoicesForAcceptedEstimate(org, user, acceptedEstimate);

  const { est1046, est1047 } = await seedHendersonMultiSite(
    org,
    customers,
    locations
  );
  const { viewedEstimate } = await seedViewedEstimate(org, user, est1046);
  const { declinedEstimate, revisedEstimate } =
    await seedDeclinedAndRevisedEstimate(org, user, est1047);

  const { nextSiteMeasureNumber, nextEstimateNumber, bulkEstimateIds } =
    await seedBulkFixtures(org, user);

  // The 9 hand-authored estimates whose Estimate.total needs backfilling,
  // matching the order they were created in above.
  const baseEstimates = [
    q5001,
    q5002,
    q5003,
    q5004,
    sentEstimate,
    acceptedEstimate,
    viewedEstimate,
    declinedEstimate,
    revisedEstimate,
  ];
  await backfillEstimateTotals([
    ...baseEstimates.map((est) => est.id),
    ...bulkEstimateIds,
  ]);

  await bumpOrgCounters(
    org,
    nextSiteMeasureNumber,
    nextEstimateNumber,
    baseEstimates.length + bulkEstimateIds.length
  );

  await seedCalendarEvents(org, customers, crew, {
    q5001,
    q5002,
    q5003,
    q5004,
  });

  console.log("\n✅ Seed complete!");
  console.log("   Login: demo@sqft.dev / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
