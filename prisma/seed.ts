/**
 * Seed script — populates the database with demo data matching the SqFt prototype
 * Run with: npx prisma db seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
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

  // ── Estimates (matching prototype) ────────────────────────────────────────

  // #1042 — Henderson — 3 rooms, LVP, with line items
  const est1042 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[0].id,
      status: "quote",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
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
            lshapeData: {
              sections: [{ w: 12, l: 4 }],
              deductions: [],
            },
            note: "L-shape, narrow at door",
            sortOrder: 2,
          },
        ],
      },
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

  // #1043 — Sharma — Tile, 2 rooms
  const est1043 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[5].id,
      status: "quote",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
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
  const est1044 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[3].id,
      status: "quote",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      items: {
        create: [
          {
            type: "room",
            name: "Living + Dining",
            shape: "lshape",
            w: 14,
            l: 22,
            lshapeData: {
              sections: [{ w: 14, l: 22 }],
              deductions: [],
            },
            note: "open concept",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // #1045 — Nguyen — empty (new lead)
  const _est1045 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[4].id,
      status: "quote",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
    },
  });

  // #1040 — Chen — Staircase
  const est1040 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[2].id,
      status: "in_progress",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
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
      status: "scheduled",
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
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

  // ── Calendar events ───────────────────────────────────────────────────────
  const today = new Date();
  const d = (offsetDays: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };

  await prisma.event.createMany({
    data: [
      {
        orgId: org.id,
        type: "job",
        title: "Chen Staircase · Day 2",
        customerId: customers[2].id,
        estimateId: est1040.id,
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
        estimateId: est1043.id,
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
        estimateId: est1040.id,
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
        estimateId: est1041.id,
        date: d(3),
        startTime: "08:00",
        endTime: "16:00",
        crew: "Carlos",
        notes: "",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Park Living + Dining",
        customerId: customers[3].id,
        estimateId: est1044.id,
        date: d(5),
        startTime: "08:00",
        endTime: "15:00",
        crew: "Dave",
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
        estimateId: est1042.id,
        date: d(6),
        startTime: "08:00",
        endTime: "16:00",
        crew: "Carlos",
        notes: "",
      },
    ],
  });
  console.log("  ✓ 9 calendar events");

  console.log("\n✅ Seed complete!");
  console.log("   Login: demo@sqft.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
