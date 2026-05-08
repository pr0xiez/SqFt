/**
 * Seed script — populates the database with demo data matching the SqFt prototype
 * Run with: npx prisma db seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding demo data…");

  // ── Organization ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: "johnson-flooring-demo" },
    update: {},
    create: {
      name: "Johnson Flooring Co.",
      slug: "johnson-flooring-demo",
      plan: "free",
    },
  });
  console.log(`  ✓ Org: ${org.name}`);

  // ── Demo user ─────────────────────────────────────────────────────────────
  const password = await bcrypt.hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@sqft.app" },
    update: { password },
    create: {
      name: "Mike Johnson",
      email: "demo@sqft.app",
      password,
      role: "owner",
      orgId: org.id,
    },
  });
  console.log(`  ✓ User: ${user.email} / password: demo1234`);

  // ── Customers (matching prototype data) ───────────────────────────────────
  const customerData = [
    {
      name: "Henderson, J.",
      phone: "(614) 555-0142",
      email: "henderson@email.com",
      address: "1247 Elm St, Columbus",
      source: "phone",
      notes: "Prefers Mon mornings",
    },
    {
      name: "Martinez, R.",
      phone: "(614) 555-0188",
      email: "rmartinez@email.com",
      address: "89 Oak Ave, Worthington",
      source: "referral",
      notes: "Referred by Henderson",
    },
    {
      name: "Chen, L.",
      phone: "(614) 555-0211",
      email: "lchen@email.com",
      address: "142 Maple Dr, Dublin",
      source: "online",
      notes: "Wants to start ASAP",
    },
    {
      name: "Park Family",
      phone: "(614) 555-0307",
      email: "parkfamily@email.com",
      address: "218 Birch Ln, Bexley",
      source: "walkin",
      notes: "",
    },
    {
      name: "Nguyen, A.",
      phone: "(614) 555-0421",
      email: "",
      address: "33 Pine Ct, Upper Arlington",
      source: "website",
      notes: "New construction",
    },
    {
      name: "Sharma, P.",
      phone: "(614) 555-0509",
      email: "p.sharma@email.com",
      address: "67 Cedar Way, Westerville",
      source: "phone",
      notes: "",
    },
  ];

  const customers: { id: number }[] = [];
  for (const c of customerData) {
    const customer = await prisma.customer.upsert({
      where: { id: customers.length + 1 },
      update: {},
      create: { ...c, orgId: org.id },
    });
    customers.push(customer);
  }
  console.log(`  ✓ ${customers.length} customers`);

  // ── Estimates (rooms only) ────────────────────────────────────────────────

  // Each estimate gets its org-wide estimateNumber allocated explicitly here
  // (the repository allocates from Organization.nextEstimateNumber in app
  // code; the seed sets it directly for stable demo numbers).

  // #1042 — Henderson — 3 rooms
  const est1042 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[0].id,
      estimateNumber: 1042,
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
            shape: "lshape",
            w: 12,
            l: 4,
            lshapeData: { sections: [{ w: 12, l: 4 }], deductions: [] },
            note: "L-shape, narrow at door",
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // #1043 — Sharma — Tile, 2 rooms
  const est1043 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[5].id,
      estimateNumber: 1043,
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
  const _est1044 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[3].id,
      estimateNumber: 1044,
      items: {
        create: [
          {
            type: "room",
            name: "Living + Dining",
            shape: "lshape",
            w: 14,
            l: 22,
            lshapeData: { sections: [{ w: 14, l: 22 }], deductions: [] },
            note: "open concept",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // #1045 — Nguyen — empty (new lead)
  const _est1045 = await prisma.estimate.create({
    data: { orgId: org.id, customerId: customers[4].id, estimateNumber: 1045 },
  });

  // #1040 — Chen — Staircase
  const est1040 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[2].id,
      estimateNumber: 1040,
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
  const est1041 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[1].id,
      estimateNumber: 1041,
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
  console.log("  ✓ 6 estimates");

  // ── Quotes ────────────────────────────────────────────────────────────────

  // #5001 — Henderson LVP (sent)
  const q5001 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1042.id,
      quoteNumber: 5001,
      status: "sent",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      lineItems: {
        create: [
          {
            name: "LVP — Mohawk RevWood",
            rate: 4.85,
            qtyMode: "linked",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
          {
            name: "Underlayment — 6 mil",
            rate: 0.45,
            qtyMode: "linked",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 1,
          },
          {
            name: "Removal of carpet",
            rate: 1.2,
            qtyMode: "linked",
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

  // #5002 — Martinez HW (accepted) — winning quote, drives the job event
  const q5002 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1041.id,
      quoteNumber: 5002,
      status: "accepted",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      lineItems: {
        create: [
          {
            name: "White oak — select grade",
            rate: 7.2,
            qtyMode: "linked",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
          {
            name: "Hardwood install — nail down",
            rate: 3.8,
            qtyMode: "linked",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 1,
          },
          {
            name: "Sand & finish — 3 coats",
            rate: 2.4,
            qtyMode: "linked",
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // #5003 — Chen Staircase (accepted) — winning quote, drives the job events
  const q5003 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1040.id,
      quoteNumber: 5003,
      status: "accepted",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
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
            qtyMode: "linked",
            wastePct: 10,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // #5004 — Sharma Tile (draft)
  const q5004 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1043.id,
      quoteNumber: 5004,
      status: "draft",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      lineItems: {
        create: [
          {
            name: "Porcelain tile 12×24",
            rate: 5.4,
            qtyMode: "linked",
            wastePct: 15,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Park (#1044) gets no quote yet — demonstrates "no quotes yet" empty state
  // Nguyen (#1045) is a brand-new lead with no rooms and no quote

  // Bump the org counters past the seeded values so newly created records
  // start fresh sequences.
  await prisma.organization.update({
    where: { id: org.id },
    data: { nextEstimateNumber: 1046, nextQuoteNumber: 5005 },
  });
  console.log("  ✓ 4 quotes");

  // ── Calendar events ───────────────────────────────────────────────────────
  const today = new Date();
  const d = (offsetDays: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };

  await prisma.event.createMany({
    data: [
      // Job events tie to a quote (the accepted/sent one for that estimate).
      {
        orgId: org.id,
        type: "job",
        title: "Chen Staircase · Day 2",
        customerId: customers[2].id,
        quoteId: q5003.id,
        date: d(0),
        startTime: "08:00",
        endTime: "16:00",
        crew: "Carlos",
        notes: "",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Williams Tile Bath · Day 1",
        customerId: customers[5].id,
        quoteId: q5004.id,
        date: d(0),
        startTime: "08:30",
        endTime: "15:30",
        crew: "Dave",
        notes: "",
      },
      {
        orgId: org.id,
        type: "visit",
        title: "Measure — Nguyen Residence",
        customerId: customers[4].id,
        date: d(0),
        startTime: "10:00",
        endTime: "11:00",
        crew: "Mike",
        notes: "",
      },
      {
        orgId: org.id,
        type: "other",
        title: "Showroom — Park Family",
        customerId: customers[3].id,
        date: d(0),
        startTime: "14:00",
        endTime: "15:00",
        crew: "Sarah",
        notes: "Material selection",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Chen Staircase · Day 3",
        customerId: customers[2].id,
        quoteId: q5003.id,
        date: d(1),
        startTime: "08:00",
        endTime: "15:00",
        crew: "Carlos",
        notes: "",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Martinez HW",
        customerId: customers[1].id,
        quoteId: q5002.id,
        date: d(3),
        startTime: "08:00",
        endTime: "16:00",
        crew: "Carlos",
        notes: "",
      },
      {
        orgId: org.id,
        type: "visit",
        title: "Henderson follow-up",
        customerId: customers[0].id,
        date: d(4),
        startTime: "10:00",
        endTime: "11:00",
        crew: "Mike",
        notes: "",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Henderson — Floor install",
        customerId: customers[0].id,
        quoteId: q5001.id,
        date: d(6),
        startTime: "08:00",
        endTime: "16:00",
        crew: "Carlos",
        notes: "",
      },
    ],
  });
  console.log("  ✓ 8 calendar events");

  console.log("\n✅ Seed complete!");
  console.log("   Login: demo@sqft.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
