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

  // ── Reset demo data so the seed is safely re-runnable ─────────────────────
  // The seed populates demo orgs (johnson-flooring-demo, other-floors-demo)
  // via `create`, not upsert, for child rows — quotes, line items, events,
  // estimates, etc. Without a wipe step, re-running duplicates everything and
  // trips unique constraints (e.g. approvalToken). Clear the demo orgs' data
  // first; cascades take care of LineItem/QuoteSignature/QuoteEvent/
  // EstimateItem rows automatically.
  const demoOrgSlugs = ["johnson-flooring-demo", "other-floors-demo"];
  const demoOrgs = await prisma.organization.findMany({
    where: { slug: { in: demoOrgSlugs } },
    select: { id: true },
  });
  if (demoOrgs.length > 0) {
    const demoOrgIds = demoOrgs.map((o) => o.id);
    await prisma.event.deleteMany({ where: { orgId: { in: demoOrgIds } } });
    await prisma.customer.deleteMany({ where: { orgId: { in: demoOrgIds } } });
    await prisma.crewMember.deleteMany({
      where: { orgId: { in: demoOrgIds } },
    });
    await prisma.lineItemTemplate.deleteMany({
      where: { orgId: { in: demoOrgIds } },
    });
    // Reset per-org counters so the seed's explicit estimate/quote numbers
    // don't drift relative to nextEstimateNumber / nextQuoteNumber.
    await prisma.organization.updateMany({
      where: { id: { in: demoOrgIds } },
      data: { nextEstimateNumber: 1, nextQuoteNumber: 1 },
    });
    console.log(`  ✓ Cleared prior demo data (${demoOrgs.length} org(s))`);
  }

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

  // ── Crew roster ───────────────────────────────────────────────────────────
  const [crewMike, crewCarlos, crewDave, crewSarah] = await Promise.all([
    prisma.crewMember.create({
      data: { orgId: org.id, name: "Mike", role: "Owner / Sales" },
    }),
    prisma.crewMember.create({
      data: { orgId: org.id, name: "Carlos", role: "Lead Installer" },
    }),
    prisma.crewMember.create({
      data: { orgId: org.id, name: "Dave", role: "Installer" },
    }),
    prisma.crewMember.create({
      data: { orgId: org.id, name: "Sarah", role: "Showroom" },
    }),
  ]);
  console.log("  ✓ 4 crew members");

  // ── Line item templates (reusable presets for quote builder) ──────────────
  await prisma.lineItemTemplate.createMany({
    data: [
      {
        orgId: org.id,
        name: "LVP — Mohawk RevWood",
        description:
          "Luxury vinyl plank, 5.5mm wear layer. Includes click-lock install over prepped subfloor.",
        rate: 4.85,
        unitLabel: "sqft",
        sortOrder: 0,
      },
      {
        orgId: org.id,
        name: "White oak — select grade",
        description:
          '3/4" solid hardwood, select grade. Material only — site-finished separately.',
        rate: 7.2,
        unitLabel: "sqft",
        sortOrder: 1,
      },
      {
        orgId: org.id,
        name: "Hardwood install — nail down",
        description: 'Nail-down install over 3/4" plywood subfloor.',
        rate: 3.8,
        unitLabel: "sqft",
        sortOrder: 2,
      },
      {
        orgId: org.id,
        name: "Carpet removal & disposal",
        description: "Includes haul-away and dump fees.",
        rate: 1.2,
        unitLabel: "sqft",
        sortOrder: 3,
      },
      {
        orgId: org.id,
        name: "Quarter round trim",
        description: "Stain-grade pine quarter round, cut and installed.",
        rate: 2.5,
        unitLabel: "lf",
        sortOrder: 4,
      },
      {
        orgId: org.id,
        name: "Floor prep & leveling",
        description: "Self-leveling compound where needed.",
        rate: 0.65,
        unitLabel: "sqft",
        sortOrder: 5,
      },
    ],
  });
  console.log("  ✓ 6 line item templates");

  // ── Demo user ─────────────────────────────────────────────────────────────
  const password = await bcrypt.hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@sqft.dev" },
    update: { password },
    create: {
      name: "Mike Johnson",
      email: "demo@sqft.dev",
      password,
      role: "admin",
      orgId: org.id,
    },
  });
  console.log(`  ✓ User: ${user.email} / password: demo1234`);

  const leadHash = await bcrypt.hash("demo1234", 10);
  await prisma.user.upsert({
    where: { email: "lead@sqft.dev" },
    update: {},
    create: {
      name: "Marcus Chen",
      email: "lead@sqft.dev",
      password: leadHash,
      role: "lead",
      orgId: org.id,
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
      orgId: org.id,
    },
  });
  console.log("  ✓ User: crew@sqft.dev / password: demo1234");

  // ── Second org + user (used by tenant-isolation E2E tests) ───────────────
  const otherOrg = await prisma.organization.upsert({
    where: { slug: "other-floors-demo" },
    update: {},
    create: {
      name: "Other Floors Co.",
      slug: "other-floors-demo",
      plan: "free",
    },
  });
  const otherUser = await prisma.user.upsert({
    where: { email: "demo2@sqft.dev" },
    update: { password },
    create: {
      name: "Other Owner",
      email: "demo2@sqft.dev",
      password,
      role: "admin",
      orgId: otherOrg.id,
    },
  });
  console.log(`  ✓ User: ${otherUser.email} / password: demo1234`);

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
            shape: "rect",
            w: 14,
            l: 22,
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
      convenienceFeeRate: 0.03,
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

  // 1×1 transparent PNG used as a placeholder signature for seeded accepts:
  const placeholderSig =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const seedConsentText =
    "By typing my name and signing below, I consent to use an electronic signature, and agree this signature has the same legal effect as a handwritten signature on this quote.";

  // #5002 — Martinez HW (accepted) — winning quote, drives the job event
  const q5002 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1041.id,
      quoteNumber: 5002,
      status: "accepted",
      convenienceFeeRate: 0.03,
      markupPct: 35,
      depositPct: 0.5,
      approvalToken: "seed-token-q5002-cccccccccccccccccccccccc",
      sentAt: new Date("2026-04-20T15:00:00Z"),
      sentToEmail: "rmartinez@email.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-04-21T09:30:00Z"),
      acceptedAt: new Date("2026-04-21T17:42:00Z"),
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

  // #5003 — Chen Staircase (accepted) — winning quote, drives the job events
  const q5003 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1040.id,
      quoteNumber: 5003,
      status: "accepted",
      convenienceFeeRate: 0.03,
      markupPct: 35,
      depositPct: 0.5,
      approvalToken: "seed-token-q5003-dddddddddddddddddddddddd",
      sentAt: new Date("2026-04-18T13:15:00Z"),
      sentToEmail: "lchen@email.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-04-18T20:05:00Z"),
      acceptedAt: new Date("2026-04-19T08:21:00Z"),
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

  // Signatures + accept-flow events for the two winning quotes above. The app
  // only flips a quote to `accepted` inside `acceptQuoteByToken`, which writes
  // a QuoteSignature in the same transaction — so accepted quotes in seed data
  // need matching signatures to preserve that invariant (and to keep the
  // /quotes/[id]/signed audit page reachable).
  await prisma.quoteSignature.create({
    data: {
      quoteId: q5002.id,
      signedByName: "Roberto Martinez",
      signedByEmail: "rmartinez@email.com",
      signatureData: placeholderSig,
      signedAt: new Date("2026-04-21T17:42:00Z"),
      signedIp: "198.51.100.22",
      signedUserAgent: "Mozilla/5.0 (seed fixture)",
      consentText: seedConsentText,
      quoteSnapshot: {
        quoteNumber: q5002.quoteNumber,
        seedFixture: true,
      },
      snapshotHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
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
      type: "accepted",
      source: "customer",
      actorEmail: "rmartinez@email.com",
      actorName: "Roberto Martinez",
      createdAt: new Date("2026-04-21T17:42:00Z"),
      ip: "198.51.100.22",
      userAgent: "Mozilla/5.0 (seed fixture)",
    },
  ] as const) {
    await prisma.quoteEvent.create({
      data: {
        quoteId: q5002.id,
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

  await prisma.quoteSignature.create({
    data: {
      quoteId: q5003.id,
      signedByName: "Linda Chen",
      signedByEmail: "lchen@email.com",
      signatureData: placeholderSig,
      signedAt: new Date("2026-04-19T08:21:00Z"),
      signedIp: "198.51.100.51",
      signedUserAgent: "Mozilla/5.0 (seed fixture)",
      consentText: seedConsentText,
      quoteSnapshot: {
        quoteNumber: q5003.quoteNumber,
        seedFixture: true,
      },
      snapshotHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
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
      type: "accepted",
      source: "customer",
      actorEmail: "lchen@email.com",
      actorName: "Linda Chen",
      createdAt: new Date("2026-04-19T08:21:00Z"),
      ip: "198.51.100.51",
      userAgent: "Mozilla/5.0 (seed fixture)",
    },
  ] as const) {
    await prisma.quoteEvent.create({
      data: {
        quoteId: q5003.id,
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
  const q5004 = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1043.id,
      quoteNumber: 5004,
      status: "draft",
      convenienceFeeRate: 0.03,
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

  // Park (#1044) gets no quote yet — demonstrates "no quotes yet" empty state
  // Nguyen (#1045) is a brand-new lead with no rooms and no quote

  // ── Sent quote: emailed but not yet viewed ────────────────────────────────
  const sentQuote = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1042.id,
      quoteNumber: 5005,
      status: "sent",
      convenienceFeeRate: 0.03,
      markupPct: 0,
      depositPct: 0.5,
      approvalToken: "seed-token-sent-quote-aaaaaaaaaaaaaaaaaaaa",
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
  await prisma.quoteEvent.create({
    data: {
      quoteId: sentQuote.id,
      type: "sent",
      source: "builder",
      actorEmail: user.email,
      actorName: user.name,
      metadata: {
        to: "buyer@example.com",
        subject: `Quote #${sentQuote.quoteNumber} from ${org.name}`,
      },
    },
  });
  console.log(`  ✓ Sent quote: #${sentQuote.quoteNumber}`);

  // ── Accepted quote: signed by customer ────────────────────────────────────
  const acceptedQuote = await prisma.quote.create({
    data: {
      orgId: org.id,
      estimateId: est1042.id,
      quoteNumber: 5006,
      status: "accepted",
      convenienceFeeRate: 0.03,
      markupPct: 0,
      depositPct: 0.5,
      approvalToken: "seed-token-accepted-quote-bbbbbbbbbbbbbbbb",
      sentAt: new Date("2026-05-01T14:00:00Z"),
      sentToEmail: "henderson@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      viewedAt: new Date("2026-05-01T16:12:00Z"),
      acceptedAt: new Date("2026-05-02T10:45:00Z"),
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

  await prisma.quoteSignature.create({
    data: {
      quoteId: acceptedQuote.id,
      signedByName: "Janet Henderson",
      signedByEmail: "henderson@example.com",
      signatureData: placeholderSig,
      signedAt: new Date("2026-05-02T10:45:00Z"),
      signedIp: "203.0.113.42",
      signedUserAgent: "Mozilla/5.0 (seed fixture)",
      consentText: seedConsentText,
      quoteSnapshot: {
        quoteNumber: acceptedQuote.quoteNumber,
        seedFixture: true,
      },
      snapshotHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
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
      type: "accepted",
      source: "customer",
      actorEmail: "henderson@example.com",
      actorName: "Janet Henderson",
      createdAt: new Date("2026-05-02T10:45:00Z"),
    },
  ] as const) {
    await prisma.quoteEvent.create({
      data: {
        quoteId: acceptedQuote.id,
        type: evt.type,
        source: evt.source,
        actorEmail: evt.actorEmail,
        actorName: evt.actorName,
        ip:
          evt.type === "viewed" || evt.type === "accepted"
            ? "203.0.113.42"
            : null,
        userAgent:
          evt.type === "viewed" || evt.type === "accepted"
            ? "Mozilla/5.0 (seed fixture)"
            : null,
        createdAt: evt.createdAt,
      },
    });
  }
  console.log(`  ✓ Accepted quote: #${acceptedQuote.quoteNumber}`);

  // Bump the org counters past the seeded values so newly created records
  // start fresh sequences.
  await prisma.organization.update({
    where: { id: org.id },
    data: { nextEstimateNumber: 1046, nextQuoteNumber: 5007 },
  });
  console.log("  ✓ 6 quotes");

  // ── Calendar events ───────────────────────────────────────────────────────
  const today = new Date();
  const d = (offsetDays: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };

  await Promise.all([
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "job",
        title: "Chen Staircase · Day 2",
        customerId: customers[2].id,
        quoteId: q5003.id,
        date: d(0),
        startTime: "08:00",
        endTime: "16:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "job",
        title: "Williams Tile Bath · Day 1",
        customerId: customers[5].id,
        quoteId: q5004.id,
        date: d(0),
        startTime: "08:30",
        endTime: "15:30",
        notes: "",
        crewMembers: { connect: [{ id: crewDave.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "visit",
        title: "Measure — Nguyen Residence",
        customerId: customers[4].id,
        date: d(0),
        startTime: "10:00",
        endTime: "11:00",
        notes: "",
        crewMembers: { connect: [{ id: crewMike.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "other",
        title: "Showroom — Park Family",
        customerId: customers[3].id,
        date: d(0),
        startTime: "14:00",
        endTime: "15:00",
        notes: "Material selection",
        crewMembers: { connect: [{ id: crewSarah.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "job",
        title: "Chen Staircase · Day 3",
        customerId: customers[2].id,
        quoteId: q5003.id,
        date: d(1),
        startTime: "08:00",
        endTime: "15:00",
        notes: "",
        crewMembers: {
          connect: [{ id: crewCarlos.id }, { id: crewDave.id }],
        },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "job",
        title: "Martinez HW",
        customerId: customers[1].id,
        quoteId: q5002.id,
        date: d(3),
        startTime: "08:00",
        endTime: "16:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "visit",
        title: "Henderson follow-up",
        customerId: customers[0].id,
        date: d(4),
        startTime: "10:00",
        endTime: "11:00",
        notes: "",
        crewMembers: { connect: [{ id: crewMike.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id,
        type: "job",
        title: "Henderson — Floor install",
        customerId: customers[0].id,
        quoteId: q5001.id,
        date: d(6),
        startTime: "08:00",
        endTime: "16:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }] },
      },
    }),
  ]);
  console.log("  ✓ 8 calendar events");

  console.log("\n✅ Seed complete!");
  console.log("   Login: demo@sqft.dev / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
