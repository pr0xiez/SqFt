/**
 * Seed script — populates the database with demo data from flooring-prototype-v0_8.html
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
    update: {},
    create: {
      name: "Mike Johnson",
      email: "demo@sqft.app",
      password,
      role: "owner",
      orgId: org.id,
    },
  });
  console.log(`  ✓ User: ${user.email} / password: demo1234`);

  // ── Customers (from prototype) ────────────────────────────────────────────
  const customerData = [
    {
      name: "Johnson, R.",
      phone: "(614) 555-0142",
      email: "rjohnson@email.com",
      address: "4821 Oakwood Dr, Columbus OH 43214",
      source: "phone",
      notes: "Wants LVP throughout main floor. Has dog.",
    },
    {
      name: "Chen, M.",
      phone: "(614) 555-0287",
      email: "mchen@gmail.com",
      address: "1203 Elm St, Westerville OH 43081",
      source: "referral",
      notes: "Referred by Johnson. Staircase + upstairs hallway.",
    },
    {
      name: "Williams, T.",
      phone: "(614) 555-0391",
      email: "twilliams@work.com",
      address: "7734 Maple Ave, Dublin OH 43016",
      source: "online",
      notes: "Kitchen tile only. Budget conscious.",
    },
    {
      name: "Garcia, A.",
      phone: "(614) 555-0455",
      email: "agarcia@yahoo.com",
      address: "2209 Pine Rd, Hilliard OH 43026",
      source: "walkin",
      notes: "Full basement LVP + bathroom tile.",
    },
    {
      name: "Thompson, B.",
      phone: "(614) 555-0518",
      email: "bthompson@email.com",
      address: "9901 Cedar Ln, Powell OH 43065",
      source: "website",
      notes: "New construction. Builder grade hardwood.",
    },
    {
      name: "Martinez, L.",
      phone: "(614) 555-0634",
      email: "lmartinez@gmail.com",
      address: "3387 Birch St, Gahanna OH 43230",
      source: "referral",
      notes: "Whole house carpet replacement.",
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

  // ── Estimates ─────────────────────────────────────────────────────────────
  const est1 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[0].id,
      status: "in_progress",
      taxRate: 0.08,
      markupPct: 12,
      depositPct: 0.5,
      items: {
        create: [
          {
            type: "room",
            name: "Living Room",
            shape: "rect",
            w: 18,
            l: 14,
            note: "Remove existing carpet first",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Dining Room",
            shape: "rect",
            w: 13,
            l: 11,
            note: "",
            sortOrder: 1,
          },
          {
            type: "room",
            name: "Main Hallway",
            shape: "rect",
            w: 4,
            l: 22,
            note: "Transition strip at front door",
            sortOrder: 2,
          },
          {
            type: "room",
            name: "Kitchen Nook",
            shape: "lshape",
            lshapeData: {
              sections: [
                { w: 12, l: 10 },
                { w: 6, l: 8 },
              ],
              deductions: [{ w: 3, l: 3, label: "Island" }],
            },
            note: "Match LVP to living room",
            sortOrder: 3,
          },
        ],
      },
      lineItems: {
        create: [
          {
            name: "LVP — Driftwood Oak 8mm",
            rate: 2.85,
            qtyMode: "linked",
            wastePct: 10,
            unitLabel: "ft²",
            linkedRoomIds: [],
            sortOrder: 0,
          },
          {
            name: "Underlayment 2mm",
            rate: 0.45,
            qtyMode: "linked",
            wastePct: 5,
            unitLabel: "ft²",
            linkedRoomIds: [],
            sortOrder: 1,
          },
          {
            name: "Demo & Haul Away",
            rate: 0.6,
            qtyMode: "linked",
            wastePct: 0,
            unitLabel: "ft²",
            linkedRoomIds: [],
            sortOrder: 2,
          },
          {
            name: "Transition Strips",
            rate: 28,
            qtyMode: "manual",
            qty: 3,
            unitLabel: "ea",
            linkedRoomIds: [],
            sortOrder: 3,
          },
          {
            name: "Installation Labor",
            rate: 1.75,
            qtyMode: "linked",
            wastePct: 0,
            unitLabel: "ft²",
            linkedRoomIds: [],
            sortOrder: 4,
          },
        ],
      },
    },
  });

  const est2 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[1].id,
      status: "scheduled",
      taxRate: 0.08,
      markupPct: 10,
      depositPct: 0.5,
      items: {
        create: [
          {
            type: "room",
            name: "Staircase",
            shape: "rect",
            w: 3,
            l: 14,
            note: "14 risers, bullnose needed",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Upstairs Hallway",
            shape: "rect",
            w: 4,
            l: 18,
            note: "",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const est3 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[3].id,
      status: "quote",
      taxRate: 0.08,
      markupPct: 15,
      depositPct: 0.5,
      items: {
        create: [
          {
            type: "room",
            name: "Basement Open Area",
            shape: "rect",
            w: 28,
            l: 36,
            note: "Below grade — check moisture first",
            sortOrder: 0,
          },
          {
            type: "room",
            name: "Basement Bedroom",
            shape: "rect",
            w: 12,
            l: 14,
            note: "",
            sortOrder: 1,
          },
          {
            type: "room",
            name: "Bathroom",
            shape: "lshape",
            lshapeData: {
              sections: [
                { w: 8, l: 6 },
                { w: 4, l: 3 },
              ],
              deductions: [{ w: 2, l: 2, label: "Vanity" }],
            },
            note: "Porcelain tile, 12×24",
            sortOrder: 2,
          },
        ],
      },
    },
  });

  const _est4 = await prisma.estimate.create({
    data: {
      orgId: org.id,
      customerId: customers[4].id,
      status: "completed",
      taxRate: 0.08,
      markupPct: 18,
      depositPct: 0.5,
    },
  });

  console.log(`  ✓ 4 estimates`);

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
        title: "Chen — LVP Staircase (Day 1)",
        customerId: customers[1].id,
        estimateId: est2.id,
        date: d(0),
        startTime: "08:00",
        endTime: "16:00",
        crew: "Carlos",
        notes: "Day 1 of 2",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Chen — LVP Staircase (Day 2)",
        customerId: customers[1].id,
        estimateId: est2.id,
        date: d(1),
        startTime: "08:00",
        endTime: "12:00",
        crew: "Carlos",
        notes: "Day 2 — finish + cleanup",
      },
      {
        orgId: org.id,
        type: "visit",
        title: "Johnson — Measure Living Room",
        customerId: customers[0].id,
        estimateId: est1.id,
        date: d(1),
        startTime: "14:00",
        endTime: "15:30",
        crew: "Mike",
        notes: "Confirm L-shape kitchen nook dims",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Johnson — LVP Install (Day 1)",
        customerId: customers[0].id,
        estimateId: est1.id,
        date: d(3),
        startTime: "07:30",
        endTime: "17:00",
        crew: "Carlos + Ray",
        notes: "Materials delivered day before",
      },
      {
        orgId: org.id,
        type: "job",
        title: "Johnson — LVP Install (Day 2)",
        customerId: customers[0].id,
        estimateId: est1.id,
        date: d(4),
        startTime: "07:30",
        endTime: "15:00",
        crew: "Carlos + Ray",
        notes: "",
      },
      {
        orgId: org.id,
        type: "visit",
        title: "Garcia — Basement Measure",
        customerId: customers[3].id,
        estimateId: est3.id,
        date: d(2),
        startTime: "10:00",
        endTime: "11:00",
        crew: "Mike",
        notes: "Bring moisture meter",
      },
      {
        orgId: org.id,
        type: "visit",
        title: "Martinez — Initial Consultation",
        customerId: customers[5].id,
        date: d(5),
        startTime: "13:00",
        endTime: "14:00",
        crew: "Mike",
        notes: "Whole house carpet replacement",
      },
      {
        orgId: org.id,
        type: "other",
        title: "Pick up materials — ProSource",
        date: d(2),
        startTime: "09:00",
        endTime: "10:00",
        crew: "Ray",
        notes: "Order #44821",
      },
    ],
  });
  console.log(`  ✓ 8 calendar events`);

  console.log("\n✅ Seed complete!");
  console.log("   Login: demo@sqft.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
