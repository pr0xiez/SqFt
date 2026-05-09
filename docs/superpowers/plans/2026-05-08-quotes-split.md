# Quotes Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split pricing/quote data out of `Estimate` into a new `Quote` model so an estimate can have many quotes; require a `quoteId` on `job`-type events.

**Architecture:** Destructive schema change. `Estimate` becomes measure-only (rooms). New `Quote` model holds line items, tax/markup/deposit, status (draft/sent/accepted/declined), org-wide `quoteNumber`, and the public `approvalToken`. `Event.estimateId` is replaced by `Event.quoteId` (required for `type === "job"`). Repositories, API routes, the public `/q/[token]` viewer, and the in-app Estimate Builder are updated. New top-level Quote Builder page is added. New top-level Quotes nav, event-panel quote-picker, and Quote Viewer redesign are deferred.

**Tech Stack:** Next.js 16 (App Router), Prisma 7, Postgres, TypeScript, Zod 4, vitest 4, Playwright, TanStack Query 5, Biome 2.

**Reference spec:** `docs/superpowers/specs/2026-05-08-quotes-split-design.md`.

**Note on intermediate state:** Tasks 1–3 alter the schema and migration. Until repositories are updated (Tasks 4–7), `tsc --noEmit` and the unit test suite will fail at the boundary of the deleted/moved fields. Each later task drives a portion back to green. The full suite must be green by the end of Task 22.

**Working directory note:** Run all commands from `D:\Code\SqFt`. Database commands use `dotenv` to load `.env.dev.local`. Examples in this plan show the bare command — prefix with `npx dotenv -e .env.dev.local --` when running migrations or seeds locally, e.g. `npx dotenv -e .env.dev.local -- npx prisma migrate dev --name add_quote_split`.

---

## File Map

### Created

- `prisma/migrations/<timestamp>_add_quote_split/migration.sql`
- `lib/repositories/quoteRepo.ts`
- `__tests__/repositories/quoteRepo.test.ts`
- `app/api/quotes/route.ts`
- `app/api/quotes/[id]/route.ts`
- `app/api/quotes/[id]/approval-token/route.ts`
- `__tests__/api/quotes.test.ts`
- `__tests__/api/quotes.[id].test.ts`
- `lib/hooks/useQuotes.ts`
- `app/(app)/quotes/[id]/page.tsx`
- `components/quotes/QuoteBuilder.tsx`
- `components/estimates/EstimateQuotesCard.tsx` (extracted card for the est→quotes list)

### Modified

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `lib/repositories/index.ts`
- `lib/repositories/estimateRepo.ts`
- `lib/repositories/eventRepo.ts`
- `__tests__/repositories/estimateRepo.test.ts`
- `__tests__/repositories/eventRepo.test.ts`
- `app/api/estimates/route.ts`
- `app/api/estimates/[id]/route.ts`
- `__tests__/api/estimates.test.ts`
- `__tests__/api/estimates.[id].test.ts`
- `__tests__/api/events.test.ts`
- `app/api/events/route.ts`
- `app/api/events/[id]/route.ts`
- `app/q/[token]/page.tsx`
- `components/estimates/PublicQuoteView.tsx`
- `components/estimates/EstimateBuilder.tsx`
- `lib/hooks/useEstimates.ts`
- `tests/e2e/estimate-builder.spec.ts`
- `tests/e2e/public-quote.spec.ts`
- `tests/e2e/pdf-quote.spec.ts` (only if it exercises pricing fields on estimates — repoint to a quote)

### Deleted

- `app/api/estimates/[id]/approval-token/route.ts`

---

## Phase 1 — Schema, migration, seed

### Task 1: Update `prisma/schema.prisma`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Apply schema changes**

Replace the file contents with:

```prisma
// SqFt — Flooring Contractor Estimating SaaS
// Multi-tenant: all data is scoped to an Organization

generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ── TENANCY ─────────────────────────────────────────────────────────────────

model Organization {
  id                  String   @id @default(cuid())
  name                String
  slug                String   @unique
  plan                String   @default("free") // free | pro
  phone               String?
  address             String?
  licenseNumber       String?
  logo                String?
  nextEstimateNumber  Int      @default(1)
  nextQuoteNumber     Int      @default(1)
  createdAt           DateTime @default(now())

  users     User[]
  customers Customer[]
  estimates Estimate[]
  quotes    Quote[]
  events    Event[]
}

model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  password  String   // bcrypt hash
  role      String   @default("member") // owner | admin | member
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

// ── CORE DATA ────────────────────────────────────────────────────────────────

model Customer {
  id        Int      @id @default(autoincrement())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  phone     String?
  email     String?
  address   String?
  source    String   @default("phone") // phone | online | referral | walkin | website
  notes     String?
  createdAt DateTime @default(now())

  estimates Estimate[]
  events    Event[]
}

model Estimate {
  id             Int      @id @default(autoincrement())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  customerId     Int
  customer       Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  title          String   @default("")
  estimateNumber Int?
  date           DateTime @default(now())
  createdAt      DateTime @default(now())

  items   EstimateItem[]
  quotes  Quote[]
}

// A room measurement or a text note inside an estimate
model EstimateItem {
  id         Int      @id @default(autoincrement())
  estimateId Int
  estimate   Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  type       String   // room | note
  sortOrder  Int      @default(0)

  // Room fields
  name       String?
  shape      String?  // rect | tri | lshape
  w          Float?
  l          Float?
  lshapeData Json?    // { sections:[{w,l}], deductions:[{w,l,label}] }
  note       String?

  // Note fields
  text       String?
}

model Quote {
  id            Int      @id @default(autoincrement())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  estimateId    Int
  estimate      Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  quoteNumber   Int
  status        String   @default("draft") // draft | sent | accepted | declined
  date          DateTime @default(now())
  taxRate       Float    @default(0.08)
  markupPct     Float    @default(0)
  depositPct    Float    @default(0.50)
  approvalToken String?  @unique
  createdAt     DateTime @default(now())

  lineItems LineItem[]
  events    Event[]
}

// A line item (material/labor) in a quote
model LineItem {
  id            Int      @id @default(autoincrement())
  quoteId       Int
  quote         Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  name          String
  rate          Float    @default(0)
  qtyMode       String   @default("manual") // manual | linked
  qty           Float?
  wastePct      Float    @default(0)
  unitLabel     String   @default("ft²")
  linkedRoomIds Int[]    // EstimateItem ids linked to this line item
  sortOrder     Int      @default(0)
}

// Calendar events: job installations, measurement visits, etc.
model Event {
  id         Int      @id @default(autoincrement())
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  type       String   // job | visit | other
  title      String
  customerId Int?
  customer   Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  quoteId    Int?
  quote      Quote? @relation(fields: [quoteId], references: [id], onDelete: SetNull)
  date       DateTime
  endDate    DateTime?
  startTime  String   // "08:00"
  endTime    String   // "17:00"
  crew       String?
  notes      String?
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Format with prisma**

Run: `npx prisma format`
Expected: prints "Formatted ..." with no errors.

- [ ] **Step 3: Do not commit yet** — Task 2 generates the migration; commit them together.

---

### Task 2: Generate the migration

**Files:**
- Create: `prisma/migrations/<timestamp>_add_quote_split/migration.sql`

- [ ] **Step 1: Run migration command**

Run: `npx dotenv -e .env.dev.local -- npx prisma migrate dev --name add_quote_split --create-only`
Expected: a new folder under `prisma/migrations/` with a `migration.sql`.

- [ ] **Step 2: Inspect the generated SQL**

Open the new `migration.sql`. Confirm it contains (in order — Prisma chooses the order, but verify these statements exist):
- `DROP CONSTRAINT` for `LineItem_estimateId_fkey` and `Event_estimateId_fkey`
- Drop columns on `Estimate`: `status`, `quoteNumber`, `taxRate`, `markupPct`, `depositPct`, `approvalToken`
- Add column `Estimate.estimateNumber`
- Drop column `LineItem.estimateId`; add `LineItem.quoteId NOT NULL`
- Drop column `Event.estimateId`; add `Event.quoteId` (nullable)
- `ALTER TABLE "Organization" ADD COLUMN "nextEstimateNumber" INTEGER NOT NULL DEFAULT 1`
- `CREATE TABLE "Quote" (...)`
- New foreign keys for `Quote.orgId`, `Quote.estimateId`, `LineItem.quoteId`, `Event.quoteId`
- Unique index on `Quote.approvalToken`

- [ ] **Step 3: Prepend a destructive reset block**

Because `LineItem.quoteId` is `NOT NULL` and existing rows can't be backfilled, prepend the following before any `ALTER TABLE`:

```sql
-- Destructive reset: drop priced/quote-tied rows so NOT NULL columns can be
-- added cleanly. Per spec 2026-05-08-quotes-split-design.md (decision: full
-- reset).
DELETE FROM "LineItem";
DELETE FROM "Event";
DELETE FROM "EstimateItem";
DELETE FROM "Estimate";
UPDATE "Organization" SET "nextQuoteNumber" = 1;
```

- [ ] **Step 4: Apply migration locally**

Run: `npx dotenv -e .env.dev.local -- npx prisma migrate dev`
Expected: migration runs to completion; `Prisma Client` is regenerated. There may be `tsc` errors after this point — that's expected until later tasks finish.

- [ ] **Step 5: Commit schema + migration**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): split Quote out of Estimate (schema + migration)"
```

---

### Task 3: Update `prisma/seed.ts`

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Rewrite the estimate/quote/event sections**

Replace the section beginning at the comment `// ── Estimates (matching prototype) ──` through the end of the calendar events block with:

```ts
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
          { type: "room", name: "Living Room", shape: "rect", w: 18, l: 14, note: "", sortOrder: 0 },
          { type: "room", name: "Master Bedroom", shape: "rect", w: 15, l: 13, note: "", sortOrder: 1 },
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
          { type: "room", name: "Master Bath", shape: "rect", w: 10, l: 8, note: "", sortOrder: 0 },
          { type: "room", name: "Powder", shape: "rect", w: 6, l: 5, note: "", sortOrder: 1 },
        ],
      },
    },
  });

  // #1044 — Park — Living + Dining, L-shape
  const est1044 = await prisma.estimate.create({
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
          { type: "room", name: "Main Staircase", shape: "rect", w: 14, l: 3, note: "13 risers · LVP wrap", sortOrder: 0 },
          { type: "room", name: "Upper Landing", shape: "rect", w: 8, l: 6, note: "", sortOrder: 1 },
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
          { type: "room", name: "Living Room", shape: "rect", w: 20, l: 16, note: "Hardwood — oak select", sortOrder: 0 },
          { type: "room", name: "Dining Room", shape: "rect", w: 14, l: 12, note: "", sortOrder: 1 },
          { type: "room", name: "Front Hall", shape: "rect", w: 10, l: 5, note: "", sortOrder: 2 },
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
          { name: "LVP — Mohawk RevWood", rate: 4.85, qtyMode: "linked", wastePct: 10, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 0 },
          { name: "Underlayment — 6 mil", rate: 0.45, qtyMode: "linked", wastePct: 0, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 1 },
          { name: "Removal of carpet", rate: 1.2, qtyMode: "linked", wastePct: 0, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 2 },
          { name: "Floor prep & leveling", rate: 0.65, qtyMode: "manual", qty: 495, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 3 },
          { name: "Quarter round trim", rate: 2.5, qtyMode: "manual", qty: 180, unitLabel: "lf", linkedRoomIds: [], sortOrder: 4 },
          { name: "Haul away & disposal", rate: 185.0, qtyMode: "manual", qty: 1, unitLabel: "job", linkedRoomIds: [], sortOrder: 5 },
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
          { name: "White oak — select grade", rate: 7.2, qtyMode: "linked", wastePct: 10, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 0 },
          { name: "Hardwood install — nail down", rate: 3.8, qtyMode: "linked", wastePct: 0, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 1 },
          { name: "Sand & finish — 3 coats", rate: 2.4, qtyMode: "linked", wastePct: 0, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 2 },
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
          { name: "LVP stair wrap kit", rate: 48.0, qtyMode: "manual", qty: 13, unitLabel: "tread", linkedRoomIds: [], sortOrder: 0 },
          { name: "Stair install labor", rate: 65.0, qtyMode: "manual", qty: 13, unitLabel: "tread", linkedRoomIds: [], sortOrder: 1 },
          { name: "Landing — LVP", rate: 4.85, qtyMode: "linked", wastePct: 10, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 2 },
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
          { name: "Porcelain tile 12×24", rate: 5.4, qtyMode: "linked", wastePct: 15, unitLabel: "sqft", linkedRoomIds: [], sortOrder: 0 },
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
      { orgId: org.id, type: "job", title: "Chen Staircase · Day 2", customerId: customers[2].id, quoteId: q5003.id, date: d(0), startTime: "08:00", endTime: "16:00", crew: "Carlos", notes: "" },
      { orgId: org.id, type: "job", title: "Williams Tile Bath · Day 1", customerId: customers[5].id, quoteId: q5004.id, date: d(0), startTime: "08:30", endTime: "15:30", crew: "Dave", notes: "" },
      { orgId: org.id, type: "visit", title: "Measure — Nguyen Residence", customerId: customers[4].id, date: d(0), startTime: "10:00", endTime: "11:00", crew: "Mike", notes: "" },
      { orgId: org.id, type: "other", title: "Showroom — Park Family", customerId: customers[3].id, date: d(0), startTime: "14:00", endTime: "15:00", crew: "Sarah", notes: "Material selection" },
      { orgId: org.id, type: "job", title: "Chen Staircase · Day 3", customerId: customers[2].id, quoteId: q5003.id, date: d(1), startTime: "08:00", endTime: "15:00", crew: "Carlos", notes: "" },
      { orgId: org.id, type: "job", title: "Martinez HW", customerId: customers[1].id, quoteId: q5002.id, date: d(3), startTime: "08:00", endTime: "16:00", crew: "Carlos", notes: "" },
      { orgId: org.id, type: "visit", title: "Henderson follow-up", customerId: customers[0].id, date: d(4), startTime: "10:00", endTime: "11:00", crew: "Mike", notes: "" },
      { orgId: org.id, type: "job", title: "Henderson — Floor install", customerId: customers[0].id, quoteId: q5001.id, date: d(6), startTime: "08:00", endTime: "16:00", crew: "Carlos", notes: "" },
    ],
  });
  console.log("  ✓ 8 calendar events");
```

(The Park job event from the old seed is dropped because Park has no accepted quote yet.)

- [ ] **Step 2: Run the seed**

Run: `npx dotenv -e .env.dev.local -- npx tsx prisma/seed.ts`
Expected: prints "✅ Seed complete!" with no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): update seed for Quote split"
```

---

## Phase 2 — Repositories

### Task 4: Update `lib/repositories/estimateRepo.ts`

**Files:**
- Modify: `lib/repositories/estimateRepo.ts`

- [ ] **Step 1: Rewrite the file**

Replace contents with:

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type EstimateWithCustomerAndCount = Prisma.EstimateGetPayload<{
  include: {
    customer: { select: { id: true; name: true; address: true } };
    _count: { select: { items: true; quotes: true } };
  };
}>;

export type EstimateWithDetails = Prisma.EstimateGetPayload<{
  include: {
    customer: true;
    items: { orderBy: { sortOrder: "asc" } };
    quotes: {
      orderBy: { createdAt: "desc" };
      select: {
        id: true;
        quoteNumber: true;
        status: true;
        date: true;
        createdAt: true;
        _count: { select: { lineItems: true } };
      };
    };
  };
}>;

// `lshapeData` accepts a JSON value or null — null is normalized to "omit"
// inside `saveEstimate` because Prisma's NullableJsonNullValueInput rejects
// raw null.
type EstimateItemInput = Omit<
  Prisma.EstimateItemUncheckedCreateInput,
  "id" | "estimateId" | "lshapeData"
> & {
  id?: number;
  lshapeData?: Prisma.InputJsonValue | null;
};

export type EstimatePatch = {
  title?: string;
  items?: EstimateItemInput[];
};

export async function listEstimates(
  orgId: string
): Promise<EstimateWithCustomerAndCount[]> {
  return prisma.estimate.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, address: true } },
      _count: { select: { items: true, quotes: true } },
    },
  });
}

export async function getEstimate(
  id: number,
  orgId: string
): Promise<EstimateWithDetails | null> {
  return prisma.estimate.findFirst({
    where: { id, orgId },
    include: {
      customer: true,
      items: { orderBy: { sortOrder: "asc" } },
      quotes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          date: true,
          createdAt: true,
          _count: { select: { lineItems: true } },
        },
      },
    },
  });
}

export async function createEstimate(
  orgId: string,
  data: Omit<
    Prisma.EstimateUncheckedCreateInput,
    "orgId" | "estimateNumber"
  >
) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { nextEstimateNumber: true },
    });
    const estimateNumber = org?.nextEstimateNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextEstimateNumber: estimateNumber + 1 },
    });
    return tx.estimate.create({ data: { ...data, orgId, estimateNumber } });
  });
}

export async function saveEstimate(
  id: number,
  orgId: string,
  patch: EstimatePatch
): Promise<EstimateWithDetails | null> {
  const { items, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    if (Object.keys(topLevel).length > 0) {
      const result = await tx.estimate.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.estimate.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (items !== undefined) {
      await tx.estimateItem.deleteMany({ where: { estimateId: id } });
      if (items.length > 0) {
        await tx.estimateItem.createMany({
          data: items.map(({ id: _id, lshapeData, ...item }) => ({
            ...item,
            estimateId: id,
            ...(lshapeData == null ? {} : { lshapeData }),
          })),
        });
      }
    }

    return tx.estimate.findFirst({
      where: { id, orgId },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
        quotes: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            date: true,
            createdAt: true,
            _count: { select: { lineItems: true } },
          },
        },
      },
    });
  });
}

export async function deleteEstimate(
  id: number,
  orgId: string
): Promise<boolean> {
  const result = await prisma.estimate.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
```

`rotateApprovalToken` and `getEstimateByToken` are removed; they move to `quoteRepo`.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: still some errors, but none originating from `lib/repositories/estimateRepo.ts` itself. Errors will be in API routes, hooks, components — those are fixed in later tasks.

- [ ] **Step 3: Don't commit yet** — bundle with the test update in Task 5.

---

### Task 5: Update `__tests__/repositories/estimateRepo.test.ts`

**Files:**
- Modify: `__tests__/repositories/estimateRepo.test.ts`

- [ ] **Step 1: Rewrite the file**

Replace contents with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateFindMany = vi.fn();
const estimateFindFirst = vi.fn();
const estimateCreate = vi.fn();
const txEstimateCreate = vi.fn();
const estimateUpdateMany = vi.fn();
const estimateDeleteMany = vi.fn();
const estimateCount = vi.fn();
const estimateItemDeleteMany = vi.fn();
const estimateItemCreateMany = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();

const txMock = {
  estimate: {
    updateMany: estimateUpdateMany,
    count: estimateCount,
    findFirst: estimateFindFirst,
    create: txEstimateCreate,
  },
  estimateItem: {
    deleteMany: estimateItemDeleteMany,
    createMany: estimateItemCreateMany,
  },
  organization: {
    findUnique: organizationFindUnique,
    update: organizationUpdate,
  },
};

const $transaction = vi.fn(
  async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: {
      findMany: estimateFindMany,
      findFirst: estimateFindFirst,
      create: estimateCreate,
      updateMany: estimateUpdateMany,
      deleteMany: estimateDeleteMany,
    },
    $transaction,
  },
}));

const {
  listEstimates,
  getEstimate,
  createEstimate,
  saveEstimate,
  deleteEstimate,
} = await import("@/lib/repositories/estimateRepo");

beforeEach(() => vi.clearAllMocks());

// ── listEstimates ─────────────────────────────────────────────────────────────

describe("listEstimates", () => {
  it("queries by orgId", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listEstimates("org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });

  it("includes quote count", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listEstimates("org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { items: true, quotes: true } },
        }),
      })
    );
  });
});

// ── getEstimate ──────────────────────────────────────────────────────────────

describe("getEstimate", () => {
  it("scopes by id and orgId and includes a lightweight quotes summary", async () => {
    estimateFindFirst.mockResolvedValue(null);
    await getEstimate(7, "org1");
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, orgId: "org1" },
        include: expect.objectContaining({
          quotes: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              quoteNumber: true,
              status: true,
            }),
          }),
        }),
      })
    );
  });
});

// ── createEstimate ───────────────────────────────────────────────────────────

describe("createEstimate", () => {
  it("allocates the next estimateNumber from Organization.nextEstimateNumber", async () => {
    organizationFindUnique.mockResolvedValue({ nextEstimateNumber: 42 });
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, estimateNumber: 42 });

    await createEstimate("org1", { customerId: 9, title: "Job" });

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextEstimateNumber: 43 },
    });
    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        customerId: 9,
        estimateNumber: 42,
      }),
    });
  });

  it("defaults estimateNumber to 1 when org counter missing", async () => {
    organizationFindUnique.mockResolvedValue(null);
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, estimateNumber: 1 });

    await createEstimate("org1", { customerId: 9 });

    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ estimateNumber: 1 }),
    });
  });
});

// ── saveEstimate ─────────────────────────────────────────────────────────────

describe("saveEstimate", () => {
  it("updates only top-level fields when no items provided", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveEstimate(1, "org1", { title: "Renamed" });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { title: "Renamed" },
    });
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveEstimate(99, "org1", { title: "x" });
    expect(result).toBeNull();
  });

  it("replaces items wholesale when items provided", async () => {
    estimateCount.mockResolvedValue(1);
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveEstimate(1, "org1", {
      items: [
        {
          type: "room",
          name: "Living",
          shape: "rect",
          w: 10,
          l: 12,
          sortOrder: 0,
        },
      ],
    });

    expect(estimateItemDeleteMany).toHaveBeenCalledWith({
      where: { estimateId: 1 },
    });
    expect(estimateItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ estimateId: 1, name: "Living" })],
    });
  });
});

// ── deleteEstimate ───────────────────────────────────────────────────────────

describe("deleteEstimate", () => {
  it("returns true when something was deleted", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEstimate(1, "org1")).toBe(true);
  });
  it("returns false when nothing matched", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteEstimate(99, "org1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test file**

Run: `npx vitest run __tests__/repositories/estimateRepo.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit estimateRepo + tests**

```bash
git add lib/repositories/estimateRepo.ts __tests__/repositories/estimateRepo.test.ts
git commit -m "refactor(repo): drop pricing fields from estimateRepo; track estimateNumber"
```

---

### Task 6: Create `lib/repositories/quoteRepo.ts`

**Files:**
- Create: `lib/repositories/quoteRepo.ts`

- [ ] **Step 1: Write the file**

```ts
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export type QuoteWithEstimateSummary = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      select: {
        id: true;
        estimateNumber: true;
        title: true;
        customer: { select: { id: true; name: true; address: true } };
      };
    };
    _count: { select: { lineItems: true } };
  };
}>;

export type QuoteWithDetails = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      include: {
        customer: true;
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
  };
}>;

export type QuoteWithPublicView = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      include: {
        customer: true;
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    org: {
      select: {
        name: true;
        phone: true;
        address: true;
        licenseNumber: true;
        logo: true;
      };
    };
  };
}>;

type LineItemInput = Omit<
  Prisma.LineItemUncheckedCreateInput,
  "id" | "quoteId"
> & { id?: number };

export type QuotePatch = {
  status?: "draft" | "sent" | "accepted" | "declined";
  taxRate?: number;
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemInput[];
};

export async function listQuotes(
  orgId: string
): Promise<QuoteWithEstimateSummary[]> {
  return prisma.quote.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      estimate: {
        select: {
          id: true,
          estimateNumber: true,
          title: true,
          customer: { select: { id: true, name: true, address: true } },
        },
      },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function listQuotesForEstimate(
  estimateId: number,
  orgId: string
): Promise<QuoteWithEstimateSummary[]> {
  return prisma.quote.findMany({
    where: { orgId, estimateId },
    orderBy: { createdAt: "desc" },
    include: {
      estimate: {
        select: {
          id: true,
          estimateNumber: true,
          title: true,
          customer: { select: { id: true, name: true, address: true } },
        },
      },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function getQuote(
  id: number,
  orgId: string
): Promise<QuoteWithDetails | null> {
  return prisma.quote.findFirst({
    where: { id, orgId },
    include: {
      estimate: {
        include: {
          customer: true,
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function createQuote(
  orgId: string,
  input: { estimateId: number }
): Promise<QuoteWithDetails | null> {
  return prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: { id: input.estimateId, orgId },
      select: { id: true },
    });
    if (!estimate) return null;

    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { nextQuoteNumber: true },
    });
    const quoteNumber = org?.nextQuoteNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextQuoteNumber: quoteNumber + 1 },
    });

    const created = await tx.quote.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        quoteNumber,
        status: "draft",
        taxRate: 0.08,
        markupPct: 0,
        depositPct: 0.5,
      },
    });

    return tx.quote.findFirst({
      where: { id: created.id, orgId },
      include: {
        estimate: {
          include: {
            customer: true,
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
  });
}

export async function saveQuote(
  id: number,
  orgId: string,
  patch: QuotePatch
): Promise<QuoteWithDetails | null> {
  const { lineItems, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    if (Object.keys(topLevel).length > 0) {
      const result = await tx.quote.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.quote.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (lineItems !== undefined) {
      await tx.lineItem.deleteMany({ where: { quoteId: id } });
      if (lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: lineItems.map(({ id: _id, ...li }) => ({
            ...li,
            quoteId: id,
          })),
        });
      }
    }

    return tx.quote.findFirst({
      where: { id, orgId },
      include: {
        estimate: {
          include: {
            customer: true,
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
  });
}

export class QuoteHasEventsError extends Error {
  constructor(public readonly eventCount: number) {
    super(`Quote has ${eventCount} scheduled event(s)`);
    this.name = "QuoteHasEventsError";
  }
}

/**
 * Delete a quote. Refuses (throws QuoteHasEventsError) when any Event still
 * references it — those are jobs that depend on this quote per the
 * type=job→quoteId invariant.
 */
export async function deleteQuote(
  id: number,
  orgId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const eventCount = await tx.event.count({
      where: { orgId, quoteId: id },
    });
    if (eventCount > 0) throw new QuoteHasEventsError(eventCount);
    const result = await tx.quote.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}

/**
 * Generate (or rotate) the public approval token for a quote.
 * Returns the new token, or null if the quote isn't found in the org.
 */
export async function rotateApprovalToken(
  id: number,
  orgId: string
): Promise<string | null> {
  const token = generateToken();
  const result = await prisma.quote.updateMany({
    where: { id, orgId },
    data: { approvalToken: token },
  });
  return result.count > 0 ? token : null;
}

/**
 * Look up a quote by its public approval token (no org scoping — the token
 * itself authorizes access). Returns null on miss.
 */
export async function getQuoteByToken(
  token: string
): Promise<QuoteWithPublicView | null> {
  return prisma.quote.findUnique({
    where: { approvalToken: token },
    include: {
      estimate: {
        include: {
          customer: true,
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      org: {
        select: {
          name: true,
          phone: true,
          address: true,
          licenseNumber: true,
          logo: true,
        },
      },
    },
  });
}
```

- [ ] **Step 2: Don't commit yet** — bundle with the test in Task 7.

---

### Task 7: Test `lib/repositories/quoteRepo.ts`

**Files:**
- Create: `__tests__/repositories/quoteRepo.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteFindMany = vi.fn();
const quoteFindFirst = vi.fn();
const quoteFindUnique = vi.fn();
const quoteCreate = vi.fn();
const txQuoteCreate = vi.fn();
const quoteUpdateMany = vi.fn();
const quoteDeleteMany = vi.fn();
const quoteCount = vi.fn();
const lineItemDeleteMany = vi.fn();
const lineItemCreateMany = vi.fn();
const estimateFindFirst = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();
const eventCount = vi.fn();

const txMock = {
  quote: {
    updateMany: quoteUpdateMany,
    count: quoteCount,
    findFirst: quoteFindFirst,
    create: txQuoteCreate,
    deleteMany: quoteDeleteMany,
  },
  lineItem: {
    deleteMany: lineItemDeleteMany,
    createMany: lineItemCreateMany,
  },
  estimate: { findFirst: estimateFindFirst },
  organization: {
    findUnique: organizationFindUnique,
    update: organizationUpdate,
  },
  event: { count: eventCount },
};

const $transaction = vi.fn(
  async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    quote: {
      findMany: quoteFindMany,
      findFirst: quoteFindFirst,
      findUnique: quoteFindUnique,
      create: quoteCreate,
      updateMany: quoteUpdateMany,
      deleteMany: quoteDeleteMany,
    },
    $transaction,
  },
}));

const {
  listQuotes,
  listQuotesForEstimate,
  getQuote,
  createQuote,
  saveQuote,
  deleteQuote,
  QuoteHasEventsError,
  rotateApprovalToken,
  getQuoteByToken,
} = await import("@/lib/repositories/quoteRepo");

beforeEach(() => vi.clearAllMocks());

describe("listQuotes", () => {
  it("scopes by orgId", async () => {
    quoteFindMany.mockResolvedValue([]);
    await listQuotes("org1");
    expect(quoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });
});

describe("listQuotesForEstimate", () => {
  it("scopes by orgId and estimateId", async () => {
    quoteFindMany.mockResolvedValue([]);
    await listQuotesForEstimate(42, "org1");
    expect(quoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1", estimateId: 42 },
      })
    );
  });
});

describe("getQuote", () => {
  it("includes estimate with customer + rooms and line items", async () => {
    quoteFindFirst.mockResolvedValue(null);
    await getQuote(1, "org1");
    expect(quoteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1" },
        include: expect.objectContaining({
          estimate: expect.objectContaining({
            include: expect.objectContaining({
              customer: true,
              items: { orderBy: { sortOrder: "asc" } },
            }),
          }),
          lineItems: { orderBy: { sortOrder: "asc" } },
        }),
      })
    );
  });
});

describe("createQuote", () => {
  it("returns null when the estimate isn't in the org", async () => {
    estimateFindFirst.mockResolvedValue(null);
    const result = await createQuote("org1", { estimateId: 99 });
    expect(result).toBeNull();
    expect(txQuoteCreate).not.toHaveBeenCalled();
  });

  it("allocates the next quoteNumber from Organization.nextQuoteNumber", async () => {
    estimateFindFirst.mockResolvedValue({ id: 1 });
    organizationFindUnique.mockResolvedValue({ nextQuoteNumber: 5005 });
    organizationUpdate.mockResolvedValue({});
    txQuoteCreate.mockResolvedValue({ id: 100, quoteNumber: 5005 });
    quoteFindFirst.mockResolvedValue({ id: 100 });

    await createQuote("org1", { estimateId: 1 });

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextQuoteNumber: 5006 },
    });
    expect(txQuoteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        estimateId: 1,
        quoteNumber: 5005,
        status: "draft",
        taxRate: 0.08,
        markupPct: 0,
        depositPct: 0.5,
      }),
    });
  });
});

describe("saveQuote", () => {
  it("updates only top-level fields when no lineItems provided", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    quoteFindFirst.mockResolvedValue({ id: 1 });

    await saveQuote(1, "org1", { status: "sent" });

    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { status: "sent" },
    });
    expect(lineItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveQuote(99, "org1", { status: "sent" });
    expect(result).toBeNull();
  });

  it("replaces line items wholesale when lineItems provided", async () => {
    quoteCount.mockResolvedValue(1);
    quoteFindFirst.mockResolvedValue({ id: 1 });

    await saveQuote(1, "org1", {
      lineItems: [
        {
          name: "Tile",
          rate: 5.4,
          qtyMode: "manual",
          qty: 100,
          unitLabel: "sqft",
          sortOrder: 0,
        },
      ],
    });

    expect(lineItemDeleteMany).toHaveBeenCalledWith({
      where: { quoteId: 1 },
    });
    expect(lineItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quoteId: 1, name: "Tile" })],
    });
  });
});

describe("deleteQuote", () => {
  it("refuses when there are tied events", async () => {
    eventCount.mockResolvedValue(2);
    await expect(deleteQuote(1, "org1")).rejects.toBeInstanceOf(
      QuoteHasEventsError
    );
    expect(quoteDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes when there are no tied events", async () => {
    eventCount.mockResolvedValue(0);
    quoteDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteQuote(1, "org1")).toBe(true);
  });
});

describe("rotateApprovalToken", () => {
  it("returns the token when the quote exists", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const token = await rotateApprovalToken(1, "org1");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { approvalToken: token },
    });
  });

  it("returns null when the quote isn't found", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 0 });
    expect(await rotateApprovalToken(99, "org1")).toBeNull();
  });
});

describe("getQuoteByToken", () => {
  it("looks up by approvalToken with full public view", async () => {
    quoteFindUnique.mockResolvedValue(null);
    await getQuoteByToken("abc123");
    expect(quoteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { approvalToken: "abc123" },
        include: expect.objectContaining({
          estimate: expect.anything(),
          lineItems: expect.anything(),
          org: expect.anything(),
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test file**

Run: `npx vitest run __tests__/repositories/quoteRepo.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit quoteRepo + tests**

```bash
git add lib/repositories/quoteRepo.ts __tests__/repositories/quoteRepo.test.ts
git commit -m "feat(repo): add quoteRepo with create/save/delete/token APIs"
```

---

### Task 8: Update `lib/repositories/eventRepo.ts`

**Files:**
- Modify: `lib/repositories/eventRepo.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export type EventWithCustomer = Prisma.EventGetPayload<{
  include: { customer: { select: { id: true; name: true; address: true } } };
}>;

export async function listEvents(orgId: string): Promise<EventWithCustomer[]> {
  return prisma.event.findMany({
    where: { orgId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: {
      customer: { select: { id: true, name: true, address: true } },
    },
  });
}

function assertJobHasQuote(
  type: string | undefined,
  quoteId: number | null | undefined
) {
  if (type === "job" && (quoteId === null || quoteId === undefined)) {
    throw new EventValidationError("Job events require a quoteId");
  }
}

export async function createEvent(
  orgId: string,
  data: Omit<Prisma.EventUncheckedCreateInput, "orgId">
) {
  assertJobHasQuote(data.type, data.quoteId ?? null);
  return prisma.event.create({ data: { ...data, orgId } });
}

export async function updateEvent(
  id: number,
  orgId: string,
  data: Prisma.EventUncheckedUpdateInput
) {
  // We need the merged shape (existing type + new quoteId, or new type +
  // existing quoteId) to validate, so resolve the current row first.
  const current = await prisma.event.findFirst({
    where: { id, orgId },
    select: { type: true, quoteId: true },
  });
  if (!current) return null;

  const nextType =
    typeof data.type === "string" ? data.type : current.type;
  const nextQuoteId =
    data.quoteId === undefined
      ? current.quoteId
      : (data.quoteId as number | null);
  assertJobHasQuote(nextType, nextQuoteId);

  const result = await prisma.event.updateMany({ where: { id, orgId }, data });
  if (result.count === 0) return null;
  return prisma.event.findFirst({ where: { id, orgId } });
}

export async function deleteEvent(id: number, orgId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
```

- [ ] **Step 2: Don't commit yet** — bundle with the test update in Task 9.

---

### Task 9: Update `__tests__/repositories/eventRepo.test.ts`

**Files:**
- Modify: `__tests__/repositories/eventRepo.test.ts`

- [ ] **Step 1: Read the existing test file**

Run: `cat __tests__/repositories/eventRepo.test.ts` (or open in editor) to see what's already covered. Replace any references to `estimateId` with `quoteId` and add the validation cases below.

- [ ] **Step 2: Rewrite the file**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const eventFindMany = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdateMany = vi.fn();
const eventDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: eventFindMany,
      findFirst: eventFindFirst,
      create: eventCreate,
      updateMany: eventUpdateMany,
      deleteMany: eventDeleteMany,
    },
  },
}));

const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  EventValidationError,
} = await import("@/lib/repositories/eventRepo");

beforeEach(() => vi.clearAllMocks());

describe("listEvents", () => {
  it("scopes by orgId and orders by date,startTime", async () => {
    eventFindMany.mockResolvedValue([]);
    await listEvents("org1");
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      })
    );
  });
});

describe("createEvent", () => {
  it("creates a visit without a quoteId", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Measure",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(eventCreate).toHaveBeenCalled();
  });

  it("creates a job when quoteId is present", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "job",
      title: "Install",
      quoteId: 42,
      date: new Date(),
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "org1", quoteId: 42 }),
    });
  });

  it("rejects a job without a quoteId", async () => {
    await expect(
      createEvent("org1", {
        type: "job",
        title: "Install",
        date: new Date(),
        startTime: "08:00",
        endTime: "16:00",
      })
    ).rejects.toBeInstanceOf(EventValidationError);
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe("updateEvent", () => {
  it("returns null when the event isn't found", async () => {
    eventFindFirst.mockResolvedValueOnce(null);
    expect(await updateEvent(99, "org1", { title: "x" })).toBeNull();
  });

  it("rejects when changing an existing job's quoteId to null", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "job", quoteId: 1 });
    await expect(
      updateEvent(1, "org1", { quoteId: null })
    ).rejects.toBeInstanceOf(EventValidationError);
  });

  it("rejects when changing a visit's type to job without supplying a quoteId", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", quoteId: null });
    await expect(
      updateEvent(1, "org1", { type: "job" })
    ).rejects.toBeInstanceOf(EventValidationError);
  });

  it("allows changing a job's quoteId to another quote", async () => {
    eventFindFirst
      .mockResolvedValueOnce({ type: "job", quoteId: 1 })
      .mockResolvedValueOnce({ id: 1 });
    eventUpdateMany.mockResolvedValue({ count: 1 });
    await updateEvent(1, "org1", { quoteId: 2 });
    expect(eventUpdateMany).toHaveBeenCalled();
  });
});

describe("deleteEvent", () => {
  it("returns true when something was deleted", async () => {
    eventDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEvent(1, "org1")).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/repositories/eventRepo.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit eventRepo + tests**

```bash
git add lib/repositories/eventRepo.ts __tests__/repositories/eventRepo.test.ts
git commit -m "refactor(repo): swap Event.estimateId for quoteId; enforce job→quote"
```

---

### Task 10: Update `lib/repositories/index.ts`

**Files:**
- Modify: `lib/repositories/index.ts`

- [ ] **Step 1: Add the quoteRepo export**

```ts
export * from "./customerRepo";
export * from "./estimateRepo";
export * from "./eventRepo";
export * from "./quoteRepo";
```

- [ ] **Step 2: Run all repo tests**

Run: `npx vitest run __tests__/repositories`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/repositories/index.ts
git commit -m "feat(repo): export quoteRepo from index"
```

---

## Phase 3 — API routes

### Task 11: Update `app/api/estimates/route.ts`

**Files:**
- Modify: `app/api/estimates/route.ts`

- [ ] **Step 1: Rewrite the create schema**

Replace the file contents with:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEstimate, listEstimates } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().max(200).default(""),
});

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const estimates = await listEstimates(orgId);
    return NextResponse.json(estimates);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const estimate = await createEstimate(orgId, parsed.data);
    return NextResponse.json(estimate, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 2: Don't commit yet** — bundle with Task 12 + 13.

---

### Task 12: Update `app/api/estimates/[id]/route.ts`

**Files:**
- Modify: `app/api/estimates/[id]/route.ts`

- [ ] **Step 1: Rewrite — drop pricing/status/lineItems from the PATCH schema**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { deleteEstimate, getEstimate, saveEstimate } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const lshapeSectionSchema = z.object({
  w: z.union([z.string(), z.number()]),
  l: z.union([z.string(), z.number()]),
});

const lshapeDeductSchema = z.object({
  w: z.union([z.string(), z.number()]),
  l: z.union([z.string(), z.number()]),
  label: z.string().optional(),
});

const estimateItemSchema = z.object({
  id: z.number().int(),
  type: z.enum(["room", "note"]),
  sortOrder: z.number().int().default(0),
  name: z.string().nullish(),
  shape: z.enum(["rect", "tri", "lshape"]).nullish(),
  w: z.number().nullish(),
  l: z.number().nullish(),
  lshapeData: z
    .object({
      sections: z.array(lshapeSectionSchema),
      deductions: z.array(lshapeDeductSchema),
    })
    .nullish(),
  note: z.string().nullish(),
  text: z.string().nullish(),
});

const updateSchema = z.object({
  title: z.string().max(200).optional(),
  items: z.array(estimateItemSchema).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const estimate = await getEstimate(parseInt(id, 10), orgId);
      if (!estimate)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(estimate);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
);

export const PATCH = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message },
          { status: 400 }
        );
      }

      const estimate = await saveEstimate(parseInt(id, 10), orgId, parsed.data);
      if (!estimate)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(estimate);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      logError({
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      await deleteEstimate(parseInt(id, 10), orgId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);
```

- [ ] **Step 2: Don't commit yet.**

---

### Task 13: Delete `app/api/estimates/[id]/approval-token/route.ts`

**Files:**
- Delete: `app/api/estimates/[id]/approval-token/route.ts`

- [ ] **Step 1: Delete the file and its parent folder if empty**

```bash
git rm app/api/estimates/\[id\]/approval-token/route.ts
```

If the `approval-token` folder is now empty, remove it:
```bash
rmdir app/api/estimates/\[id\]/approval-token 2>/dev/null || true
```

- [ ] **Step 2: Update `__tests__/api/estimates.test.ts`**

Open the file. Remove pricing fields (`taxRate`, `markupPct`, `depositPct`) from the create-test request body — `createSchema` no longer accepts them. The test at the line that posts `{ customerId: 1, title: "New Job" }` is already minimal, but search for and remove any other reference to pricing fields in this file. Also remove any existing test that exercises `/api/estimates/[id]/approval-token` (it's been deleted).

- [ ] **Step 3: Update `__tests__/api/estimates.[id].test.ts`**

Remove tests for: pricing fields in PATCH; status field in PATCH; line items in PATCH; approval-token rotation. Keep tests for: GET 200/404, PATCH title, PATCH items, DELETE 200, tenant scoping.

- [ ] **Step 4: Run the API tests for estimates**

Run: `npx vitest run __tests__/api/estimates.test.ts __tests__/api/estimates.\[id\].test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/estimates __tests__/api/estimates.test.ts __tests__/api/estimates.\[id\].test.ts
git commit -m "refactor(api): drop pricing/approval-token from estimates API"
```

---

### Task 14: Create `app/api/quotes/route.ts`

**Files:**
- Create: `app/api/quotes/route.ts`

- [ ] **Step 1: Write the file**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createQuote, listQuotes } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  estimateId: z.number().int().positive(),
});

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const quotes = await listQuotes(orgId);
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const quote = await createQuote(orgId, parsed.data);
    if (!quote) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 2: Don't commit yet.**

---

### Task 15: Create `app/api/quotes/[id]/route.ts`

**Files:**
- Create: `app/api/quotes/[id]/route.ts`

- [ ] **Step 1: Write the file**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import {
  deleteQuote,
  getQuote,
  QuoteHasEventsError,
  saveQuote,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const lineItemSchema = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  rate: z.number(),
  qtyMode: z.enum(["manual", "linked"]).default("manual"),
  qty: z.number().nullish(),
  wastePct: z.number().default(0),
  unitLabel: z.string().default("ft²"),
  linkedRoomIds: z.array(z.number().int()).default([]),
  sortOrder: z.number().int().default(0),
});

const updateSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  markupPct: z.number().min(0).optional(),
  depositPct: z.number().min(0).max(1).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const quote = await getQuote(parseInt(id, 10), orgId);
      if (!quote)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(quote);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
);

export const PATCH = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message },
          { status: 400 }
        );
      }

      const quote = await saveQuote(parseInt(id, 10), orgId, parsed.data);
      if (!quote)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(quote);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      logError({
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      await deleteQuote(parseInt(id, 10), orgId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof QuoteHasEventsError) {
        return NextResponse.json(
          {
            error: `Reassign or delete the ${err.eventCount} scheduled job(s) for this quote first.`,
          },
          { status: 409 }
        );
      }
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);
```

- [ ] **Step 2: Don't commit yet.**

---

### Task 16: Create `app/api/quotes/[id]/approval-token/route.ts`

**Files:**
- Create: `app/api/quotes/[id]/approval-token/route.ts`

- [ ] **Step 1: Write the file**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { rotateApprovalToken } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const token = await rotateApprovalToken(parseInt(id, 10), orgId);
      if (!token)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ approvalToken: token });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);
```

`rotateApprovalToken` is now exported by `quoteRepo` (and re-exported via `lib/repositories/index.ts`); it resolves to the quote one because the estimate one was deleted in Task 4.

- [ ] **Step 2: Don't commit yet** — bundle with API tests in Task 17.

---

### Task 17: Tests for `app/api/quotes/*`

**Files:**
- Create: `__tests__/api/quotes.test.ts`
- Create: `__tests__/api/quotes.[id].test.ts`

- [ ] **Step 1: Write `__tests__/api/quotes.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listQuotes: vi.fn(),
  createQuote: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

const { listQuotes, createQuote } = await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET, POST } = await import("@/app/api/quotes/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockListQuotes = vi.mocked(listQuotes);
const mockCreateQuote = vi.mocked(createQuote);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes", () => {
  it("returns the quotes list scoped to org", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockListQuotes.mockResolvedValue([{ id: 1 }] as any);
    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await GET(undefined as any);
    expect(res.status).toBe(200);
    expect(mockListQuotes).toHaveBeenCalledWith("org1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await GET(undefined as any);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/quotes", () => {
  it("creates a quote and returns 201", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreateQuote.mockResolvedValue({ id: 5, estimateId: 9 } as any);

    const req = makeRequest({ estimateId: 9 });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(201);
    expect(mockCreateQuote).toHaveBeenCalledWith("org1", { estimateId: 9 });
  });

  it("returns 404 when the estimate isn't in the org", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockCreateQuote.mockResolvedValue(null);
    const req = makeRequest({ estimateId: 99 });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(404);
  });

  it("returns 400 when estimateId is missing", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest({});
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Write `__tests__/api/quotes.[id].test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuote: vi.fn(),
  saveQuote: vi.fn(),
  deleteQuote: vi.fn(),
  rotateApprovalToken: vi.fn(),
  QuoteHasEventsError: class QuoteHasEventsError extends Error {
    constructor(public readonly eventCount: number) {
      super(`Quote has ${eventCount} scheduled event(s)`);
      this.name = "QuoteHasEventsError";
    }
  },
}));

vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const { getQuote, saveQuote, deleteQuote, rotateApprovalToken, QuoteHasEventsError } =
  await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET, PATCH, DELETE } = await import("@/app/api/quotes/[id]/route");
const { POST: tokenPOST } = await import(
  "@/app/api/quotes/[id]/approval-token/route"
);

const mockGetOrgId = vi.mocked(getOrgId);
const mockGetQuote = vi.mocked(getQuote);
const mockSaveQuote = vi.mocked(saveQuote);
const mockDeleteQuote = vi.mocked(deleteQuote);
const mockRotate = vi.mocked(rotateApprovalToken);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown, method = "PATCH"): Request {
  return new Request("http://localhost/api/quotes/1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes/[id]", () => {
  it("returns 200 with the quote", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetQuote.mockResolvedValue({ id: 1 } as any);
    const res = await GET(
      // biome-ignore lint/suspicious/noExplicitAny: GET handler
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockGetQuote.mockResolvedValue(null);
    const res = await GET(
      // biome-ignore lint/suspicious/noExplicitAny: GET handler
      undefined as any,
      makeParams("99")
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/quotes/[id]", () => {
  it("validates status enum", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest({ status: "garbage" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("validates taxRate range", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest({ taxRate: 2 });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("forwards a valid patch to saveQuote", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSaveQuote.mockResolvedValue({ id: 1, status: "sent" } as any);
    const req = makeRequest({ status: "sent" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], makeParams("1"));
    expect(res.status).toBe(200);
    expect(mockSaveQuote).toHaveBeenCalledWith(1, "org1", { status: "sent" });
  });
});

describe("DELETE /api/quotes/[id]", () => {
  it("returns 200 on success", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteQuote.mockResolvedValue(true);
    const res = await DELETE(
      // biome-ignore lint/suspicious/noExplicitAny: DELETE handler
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 when the quote has tied events", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteQuote.mockRejectedValue(new QuoteHasEventsError(2));
    const res = await DELETE(
      // biome-ignore lint/suspicious/noExplicitAny: DELETE handler
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: expect.stringContaining("2 scheduled job"),
    });
  });
});

describe("POST /api/quotes/[id]/approval-token", () => {
  it("returns the rotated token", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockRotate.mockResolvedValue("the-token");
    const res = await tokenPOST(
      // biome-ignore lint/suspicious/noExplicitAny: POST handler
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approvalToken: "the-token" });
  });

  it("returns 404 when the quote isn't found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockRotate.mockResolvedValue(null);
    const res = await tokenPOST(
      // biome-ignore lint/suspicious/noExplicitAny: POST handler
      undefined as any,
      makeParams("99")
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/api/quotes.test.ts __tests__/api/quotes.\[id\].test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit quote API + tests**

```bash
git add app/api/quotes __tests__/api/quotes.test.ts __tests__/api/quotes.\[id\].test.ts
git commit -m "feat(api): add /api/quotes routes (list, create, patch, delete, token)"
```

---

### Task 18: Update events API for quoteId

**Files:**
- Modify: `app/api/events/route.ts`
- Modify: `app/api/events/[id]/route.ts`
- Modify: `__tests__/api/events.test.ts`

- [ ] **Step 1: Update `app/api/events/route.ts`**

Replace contents with:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEvent, listEvents } from "@/lib/repositories";
import { EventValidationError } from "@/lib/repositories/eventRepo";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  type: z.enum(["job", "visit", "other"]),
  title: z.string().min(1).max(200),
  customerId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  crew: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const events = await listEvents(orgId);
    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const { endDate, ...rest } = parsed.data;
    const event = await createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
    });

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof EventValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 2: Update `app/api/events/[id]/route.ts`**

Open the file first to see its current shape. Then replace the contents with:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { deleteEvent, updateEvent } from "@/lib/repositories";
import { EventValidationError } from "@/lib/repositories/eventRepo";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const updateSchema = z.object({
  type: z.enum(["job", "visit", "other"]).optional(),
  title: z.string().min(1).max(200).optional(),
  customerId: z.number().int().positive().nullable().optional(),
  quoteId: z.number().int().positive().nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  crew: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message },
          { status: 400 }
        );
      }

      const { date, endDate, ...rest } = parsed.data;
      const event = await updateEvent(parseInt(id, 10), orgId, {
        ...rest,
        ...(date ? { date: new Date(date) } : {}),
        ...(endDate === undefined
          ? {}
          : { endDate: endDate ? new Date(endDate) : null }),
      });
      if (!event)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(event);
    } catch (err) {
      if (err instanceof EventValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      logError({
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      await deleteEvent(parseInt(id, 10), orgId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);
```

If the original file used a different export shape (e.g. exported a `GET`), preserve that handler — only the PATCH/DELETE shape and the schema are changing.

- [ ] **Step 3: Update `__tests__/api/events.test.ts`**

- Replace any `estimateId` field in test bodies with `quoteId`.
- Add a test: `POST /api/events` with `{ type: "job", title: "x", date: "2026-05-08", startTime: "08:00", endTime: "16:00" }` (no `quoteId`) → repository throws `EventValidationError` → API returns 400.
- Add a test: `POST /api/events` with `{ type: "visit", ... }` (no `quoteId`) → 201.

The test must mock `EventValidationError` similarly to how `quotes.[id].test.ts` mocks `QuoteHasEventsError` — define it in the `vi.mock("@/lib/repositories/eventRepo", ...)` factory so `instanceof` checks in the route work.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/events.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/events __tests__/api/events.test.ts
git commit -m "refactor(api): swap Event.estimateId for quoteId; reject jobs without quote"
```

---

## Phase 4 — Public viewer

### Task 19: Repoint `app/q/[token]/page.tsx` and `PublicQuoteView` to Quote

**Files:**
- Modify: `app/q/[token]/page.tsx`
- Modify: `components/estimates/PublicQuoteView.tsx`

- [ ] **Step 1: Update the page**

Replace `app/q/[token]/page.tsx` contents with:

```tsx
import { notFound } from "next/navigation";
import {
  type PublicQuote,
  PublicQuoteView,
} from "@/components/estimates/PublicQuoteView";
import { getQuoteByToken } from "@/lib/repositories";
import type { LShapeData } from "@/lib/utils";

export const metadata = {
  title: "Quote — SqFt",
  // Public token URLs must not be indexed.
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params;

  // Reject any token shape that couldn't have been issued, before hitting the DB.
  if (!token || token.length < 16 || token.length > 128) notFound();

  const quote = await getQuoteByToken(token);
  if (!quote) notFound();

  const view: PublicQuote = {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    date: quote.date,
    taxRate: quote.taxRate,
    markupPct: quote.markupPct,
    depositPct: quote.depositPct,
    estimate: {
      id: quote.estimate.id,
      estimateNumber: quote.estimate.estimateNumber,
      title: quote.estimate.title,
    },
    customer: quote.estimate.customer
      ? {
          name: quote.estimate.customer.name,
          address: quote.estimate.customer.address,
        }
      : null,
    items: quote.estimate.items.map((i) => ({
      id: i.id,
      type: i.type,
      sortOrder: i.sortOrder,
      name: i.name,
      shape: i.shape,
      w: i.w,
      l: i.l,
      lshapeData: i.lshapeData as LShapeData | null,
      note: i.note,
      text: i.text,
    })),
    lineItems: quote.lineItems.map((li) => ({
      id: li.id,
      name: li.name,
      rate: li.rate,
      qtyMode: li.qtyMode,
      qty: li.qty,
      wastePct: li.wastePct,
      unitLabel: li.unitLabel,
      linkedRoomIds: li.linkedRoomIds,
      sortOrder: li.sortOrder,
    })),
    org: quote.org,
  };

  return <PublicQuoteView quote={view} />;
}
```

- [ ] **Step 2: Update `components/estimates/PublicQuoteView.tsx`**

Open the file. Rename the existing exported type from `PublicEstimate` → `PublicQuote`. Restructure the type so it carries `quoteNumber`, `status`, `taxRate/markupPct/depositPct`, `lineItems`, an `estimate: { id, estimateNumber, title }` summary, plus `customer`, `items`, and `org`. Update the component prop name from `estimate` → `quote` and replace internal references accordingly. The rendering layout stays the same — this is a data-source rename.

- [ ] **Step 3: Run tsc on the affected files**

Run: `npx tsc --noEmit`
Expected: errors only in files that haven't been updated yet (estimate builder, hooks). The two files you edited should be clean.

- [ ] **Step 4: Don't commit yet** — bundle with the e2e + components in Task 22.

---

## Phase 5 — UI wiring

### Task 20: Update `lib/hooks/useEstimates.ts`

**Files:**
- Modify: `lib/hooks/useEstimates.ts`

- [ ] **Step 1: Rewrite**

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RoomItem } from "@/lib/utils";

export interface EstimateQuoteSummary {
  id: number;
  quoteNumber: number;
  status: string;
  date: string;
  createdAt: string;
  _count: { lineItems: number };
}

export interface Estimate {
  id: number;
  orgId: string;
  customerId: number;
  title: string;
  estimateNumber?: number | null;
  date: string;
  createdAt: string;
  customer?: { id: number; name: string; address?: string | null };
  items?: RoomItem[];
  quotes?: EstimateQuoteSummary[];
  _count?: { items: number; quotes: number };
}

export interface CreateEstimateInput {
  customerId: number;
  title?: string;
}

export interface UpdateEstimateInput {
  title?: string;
  items?: RoomItem[];
}

async function fetchEstimates(): Promise<Estimate[]> {
  const res = await fetch("/api/estimates");
  if (!res.ok) throw new Error("Failed to fetch estimates");
  return res.json();
}

async function fetchEstimate(id: number): Promise<Estimate> {
  const res = await fetch(`/api/estimates/${id}`);
  if (!res.ok) throw new Error("Failed to fetch estimate");
  return res.json();
}

export function useEstimates() {
  return useQuery({ queryKey: ["estimates"], queryFn: fetchEstimates });
}

export function useEstimate(id: number) {
  return useQuery({
    queryKey: ["estimates", id],
    queryFn: () => fetchEstimate(id),
    enabled: !!id,
  });
}

export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEstimateInput) => {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create estimate");
      return res.json() as Promise<Estimate>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
  });
}

export function useUpdateEstimate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateEstimateInput) => {
      const res = await fetch(`/api/estimates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save estimate");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimates", id] });
    },
  });
}

export function useDeleteEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/estimates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
  });
}
```

`useRotateApprovalToken` is removed from this hook (it now lives in `useQuotes`).

- [ ] **Step 2: Don't commit yet** — bundle with new useQuotes hook in Task 21.

---

### Task 21: Create `lib/hooks/useQuotes.ts`

**Files:**
- Create: `lib/hooks/useQuotes.ts`

- [ ] **Step 1: Write the file**

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LineItemCalc, RoomItem } from "@/lib/utils";

export interface QuoteEstimateSummary {
  id: number;
  estimateNumber?: number | null;
  title: string;
  customer?: { id: number; name: string; address?: string | null };
}

export interface QuoteListItem {
  id: number;
  orgId: string;
  estimateId: number;
  quoteNumber: number;
  status: string;
  date: string;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  createdAt: string;
  estimate: QuoteEstimateSummary;
  _count: { lineItems: number };
}

export interface QuoteDetail {
  id: number;
  orgId: string;
  estimateId: number;
  quoteNumber: number;
  status: string;
  date: string;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  approvalToken?: string | null;
  createdAt: string;
  estimate: {
    id: number;
    estimateNumber?: number | null;
    title: string;
    customer?: { id: number; name: string; address?: string | null };
    items: RoomItem[];
  };
  lineItems: LineItemCalc[];
}

export interface UpdateQuoteInput {
  status?: "draft" | "sent" | "accepted" | "declined";
  taxRate?: number;
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemCalc[];
}

async function fetchQuotes(): Promise<QuoteListItem[]> {
  const res = await fetch("/api/quotes");
  if (!res.ok) throw new Error("Failed to fetch quotes");
  return res.json();
}

async function fetchQuote(id: number): Promise<QuoteDetail> {
  const res = await fetch(`/api/quotes/${id}`);
  if (!res.ok) throw new Error("Failed to fetch quote");
  return res.json();
}

export function useQuotes() {
  return useQuery({ queryKey: ["quotes"], queryFn: fetchQuotes });
}

export function useQuote(id: number) {
  return useQuery({
    queryKey: ["quotes", id],
    queryFn: () => fetchQuote(id),
    enabled: !!id,
  });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { estimateId: number }): Promise<QuoteDetail> => {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create quote");
      return res.json();
    },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["estimates", q.estimateId] });
    },
  });
}

export function useUpdateQuote(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateQuoteInput) => {
      const res = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save quote");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", id] });
    },
  });
}

export function useRotateQuoteToken(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ approvalToken: string }> => {
      const res = await fetch(`/api/quotes/${id}/approval-token`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate approval token");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", id] }),
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number): Promise<{ ok?: boolean; error?: string }> => {
      const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Quote has scheduled events");
      }
      if (!res.ok) throw new Error("Failed to delete quote");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}
```

- [ ] **Step 2: Commit hook updates**

```bash
git add lib/hooks/useEstimates.ts lib/hooks/useQuotes.ts
git commit -m "feat(hooks): add useQuotes; drop pricing fields from useEstimates"
```

---

### Task 22: Refactor `EstimateBuilder.tsx`

**Files:**
- Modify: `components/estimates/EstimateBuilder.tsx`
- Create: `components/estimates/EstimateQuotesCard.tsx`

- [ ] **Step 1: Create `EstimateQuotesCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { EstimateQuoteSummary } from "@/lib/hooks/useEstimates";

interface Props {
  quotes: EstimateQuoteSummary[];
  onCreateQuote: () => void;
  isCreating: boolean;
}

export function EstimateQuotesCard({
  quotes,
  onCreateQuote,
  isCreating,
}: Props) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 mb-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Quotes for this estimate ({quotes.length})
        </h2>
        <Button
          variant="default"
          size="sm"
          onClick={onCreateQuote}
          disabled={isCreating}
        >
          {isCreating ? "Creating…" : "+ Create Quote"}
        </Button>
      </header>

      {quotes.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-6 text-center">
          No quotes yet — create one to start pricing.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link
                href={`/quotes/${q.id}`}
                className="flex items-center gap-4 py-3 hover:bg-[var(--surface-2)] -mx-3 px-3 rounded"
              >
                <span className="font-[var(--font-mono)] text-[12px] font-semibold w-16">
                  #{q.quoteNumber}
                </span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] flex-1">
                  {q._count.lineItems} line item
                  {q._count.lineItems === 1 ? "" : "s"}
                </span>
                <span
                  className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${statusClass(q.status)}`}
                >
                  {q.status}
                </span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "sent":
      return "text-[var(--gold)] border-[var(--gold)]";
    case "accepted":
      return "text-[var(--sage)] border-[var(--sage)]";
    case "declined":
      return "text-[var(--accent)] border-[var(--accent)]";
    default:
      return "text-[var(--muted)] border-[var(--line)]";
  }
}
```

- [ ] **Step 2: Rewrite `EstimateBuilder.tsx`**

Open the existing file and remove these in this order:
1. `<LineItemSection ... />` and any line-item state.
2. `<QuoteSummary ... />` and any pricing math.
3. The share-link / approval-token UI (any code referencing `approvalToken`, `useRotateApprovalToken`, the actions menu's "Copy share link" / "Generate new link" entries, and the PdfModal trigger if it depended on pricing).
4. Status controls.

Then add the quotes card and the create-quote action:

```tsx
// At the top, add imports:
import { useRouter } from "next/navigation";
import { EstimateQuotesCard } from "@/components/estimates/EstimateQuotesCard";
import { useCreateQuote } from "@/lib/hooks/useQuotes";

// Inside the component, alongside the other hooks:
const router = useRouter();
const createQuote = useCreateQuote();

async function handleCreateQuote() {
  try {
    const newQuote = await createQuote.mutateAsync({ estimateId });
    router.push(`/quotes/${newQuote.id}`);
  } catch {
    showToast("Failed to create quote");
  }
}

// In the JSX, between the customer/title block and the rooms section:
<EstimateQuotesCard
  quotes={estimate.quotes ?? []}
  onCreateQuote={handleCreateQuote}
  isCreating={createQuote.isPending}
/>
```

Replace the previous primary action button (PDF/share) in the page header with a single button:

```tsx
<Button variant="default" onClick={handleCreateQuote} disabled={createQuote.isPending}>
  {createQuote.isPending ? "Creating…" : "+ Create Quote"}
</Button>
```

If `PdfModal` was the only consumer of pricing data here, remove its dynamic import too. (PDF rendering will move to the Quote Builder in a follow-up; for this slice, don't ship a half-wired PDF flow.)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean — no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add components/estimates/EstimateBuilder.tsx components/estimates/EstimateQuotesCard.tsx
git commit -m "feat(ui): replace pricing UI in EstimateBuilder with Quotes card"
```

---

### Task 23: Create the Quote Builder page

**Files:**
- Create: `components/quotes/QuoteBuilder.tsx`
- Create: `app/(app)/quotes/[id]/page.tsx`

- [ ] **Step 1: Create the page**

`app/(app)/quotes/[id]/page.tsx`:

```tsx
import { QuoteBuilderView } from "@/components/quotes/QuoteBuilder";

export const metadata = { title: "Quote Builder — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuoteBuilderPage({ params }: Props) {
  const { id } = await params;
  return <QuoteBuilderView quoteId={parseInt(id, 10)} />;
}
```

- [ ] **Step 2: Create the component**

`components/quotes/QuoteBuilder.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { QuoteSummary } from "@/components/estimates/QuoteSummary";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useOrg } from "@/lib/hooks/useOrg";
import {
  useQuote,
  useRotateQuoteToken,
  useUpdateQuote,
} from "@/lib/hooks/useQuotes";
import { estTotalArea } from "@/lib/utils";

interface Props {
  quoteId: number;
}

export function QuoteBuilderView({ quoteId }: Props) {
  const { data: quote, isLoading } = useQuote(quoteId);
  const { data: org } = useOrg();
  const updateQuote = useUpdateQuote(quoteId);
  const rotateToken = useRotateQuoteToken(quoteId);
  const { showToast } = useToast();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsOpen]);

  async function copyShareLink(forceNew: boolean) {
    setActionsOpen(false);
    try {
      let token = quote?.approvalToken ?? null;
      if (!token || forceNew) {
        const res = await rotateToken.mutateAsync();
        token = res.approvalToken;
      }
      const url = `${window.location.origin}/q/${token}`;
      await navigator.clipboard.writeText(url);
      showToast(forceNew ? "New link copied" : "Link copied");
    } catch {
      showToast("Failed to generate link");
    }
  }

  if (isLoading) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-8">
        Loading quote…
      </p>
    );
  }

  if (!quote) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] py-8">
        Quote not found.
      </p>
    );
  }

  const rooms = quote.estimate.items ?? [];
  const grossArea = estTotalArea(rooms);

  return (
    <div className="max-w-[1200px] mx-auto p-8">
      <header className="flex items-end justify-between gap-5 mb-7 flex-wrap">
        <div>
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-wider mb-1.5">
            Quote #{quote.quoteNumber} · {quote.status} ·{" "}
            {new Date(quote.date).toLocaleDateString()}
          </p>
          <h1 className="text-[36px] font-bold tracking-tight leading-tight">
            Line Items &amp; Pricing
          </h1>
          <p className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            Tied to Estimate #{quote.estimate.estimateNumber ?? quote.estimate.id}
            {" · "}
            {rooms.length} room{rooms.length === 1 ? "" : "s"} · {grossArea} sqft
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/estimates/${quote.estimateId}`}>
            <Button variant="ghost">← Back to estimate</Button>
          </Link>
          <div ref={actionsRef} className="relative">
            <Button
              variant="default"
              onClick={() => setActionsOpen((v) => !v)}
            >
              Send to customer →
            </Button>
            {actionsOpen && (
              <div className="absolute right-0 mt-1 bg-[var(--surface)] border border-[var(--line)] rounded-md shadow-md py-1 min-w-[200px] z-10">
                <button
                  type="button"
                  className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                  onClick={() => copyShareLink(false)}
                >
                  Copy share link
                </button>
                <button
                  type="button"
                  className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                  onClick={() => copyShareLink(true)}
                >
                  Generate new link
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <LineItemSection
        items={quote.lineItems ?? []}
        rooms={rooms}
        onChange={(lineItems) => updateQuote.mutate({ lineItems })}
      />

      <QuoteSummary
        lineItems={quote.lineItems ?? []}
        rooms={rooms}
        taxRate={quote.taxRate}
        markupPct={quote.markupPct}
        depositPct={quote.depositPct}
        onTaxRateChange={(taxRate) => updateQuote.mutate({ taxRate })}
        onMarkupPctChange={(markupPct) => updateQuote.mutate({ markupPct })}
        onDepositPctChange={(depositPct) => updateQuote.mutate({ depositPct })}
      />
    </div>
  );
}
```

> The exact prop signatures of `LineItemSection` and `QuoteSummary` may differ from the placeholders above. Open each component's source and match the wiring exactly — this task swaps the *data source* (estimate → quote), it does not redesign the components. If the existing components accept callbacks named differently, keep their names.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `LineItemSection` / `QuoteSummary` types don't match, adjust the call sites in `QuoteBuilder.tsx` to match.

- [ ] **Step 4: Visit the page in dev**

Run: `npm run dev`
In the browser, log in (`demo@sqft.app` / `demo1234`), open an estimate, click "+ Create Quote", land on `/quotes/[id]`. Add a line item, refresh — confirm it persists.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/quotes components/quotes
git commit -m "feat(ui): add Quote Builder page wired to /api/quotes"
```

---

### Task 24: Update e2e tests

**Files:**
- Modify: `tests/e2e/estimate-builder.spec.ts`
- Modify: `tests/e2e/public-quote.spec.ts`
- Possibly modify: `tests/e2e/pdf-quote.spec.ts`

- [ ] **Step 1: Identify what each spec exercises today**

Run: `npx playwright test --list`
Read through each affected spec and identify:
- Tests that assert pricing UI on the estimate page → those should now assert the Quotes card / "+ Create Quote" button instead.
- Tests that POST to `/api/estimates/[id]/approval-token` → repoint to the quote endpoint.
- Tests that visit `/q/[token]` → ensure the test harness creates a quote and rotates *its* token.

- [ ] **Step 2: Update `estimate-builder.spec.ts`**

Replace pricing assertions with Quotes-card assertions. Concrete pattern:

```ts
// After loading the estimate page:
await expect(page.getByText("Quotes for this estimate")).toBeVisible();

// Click "+ Create Quote":
await page.getByRole("button", { name: /\+ Create Quote/ }).click();
await expect(page).toHaveURL(/\/quotes\/\d+/);

// On the quote page, confirm the line items section is interactive:
await expect(page.getByText(/Line Items.*Pricing/i)).toBeVisible();
```

- [ ] **Step 3: Update `public-quote.spec.ts`**

Where the existing test seeds an approval token on an estimate, change the seeding to create a Quote on that estimate first, then rotate the *quote's* token. The public URL is unchanged (`/q/<token>`); only the source row changes.

- [ ] **Step 4: Inspect `pdf-quote.spec.ts`**

If it exercises pricing UI on the estimate page, either repoint it to a quote-builder flow (preferred), OR mark its tests with `test.skip(...)` and add a TODO referencing the deferred PDF wiring. Don't ship a passing test that asserts behavior we've removed.

- [ ] **Step 5: Run e2e**

Run: `npx playwright test`
Expected: all green. If a test fails, fix it — don't skip without explicit reason.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): update specs for the Quote split"
```

---

## Phase 6 — Verification

### Task 25: Final verification sweep

**Files:** none

- [ ] **Step 1: Lint**

Run: `npx biome ci .`
Expected: 0 errors.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Unit + integration tests**

Run: `npx vitest run`
Expected: all suites pass.

- [ ] **Step 4: E2E**

Run: `npx playwright test`
Expected: all suites pass.

- [ ] **Step 5: Migration replay**

Run on a clean DB (or after `npx dotenv -e .env.dev.local -- npx prisma migrate reset --force`):
```
npx dotenv -e .env.dev.local -- npx prisma migrate deploy
npx dotenv -e .env.dev.local -- npx tsx prisma/seed.ts
```
Expected: both run cleanly. Manually verify in the app: estimate list shows quote counts, opening an estimate shows the Quotes card, "+ Create Quote" lands on a working quote page.

- [ ] **Step 6: Final commit (if anything was tweaked during verification)**

If any small fixes were needed during the sweep:
```bash
git add -A
git commit -m "chore: post-verification fixes for Quote split"
```
