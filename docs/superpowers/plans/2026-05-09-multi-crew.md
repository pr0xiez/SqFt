# Multi-crew + Crew Filter Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-string `Event.crew` field with a many-to-many `CrewMember` model; surface multi-crew assignment in the event form, avatar dots on calendar/dashboard event chips, a single-select Crew filter bar above the calendar, and a small `/crew` roster admin page.

**Architecture:** Schema-first. Add `CrewMember` (org-scoped, with `name`, `role`, `archived`) and an implicit Prisma M:N to `Event`. A single migration backfills existing `Event.crew` strings into `CrewMember` rows + the join table, then drops the column. Repos, API routes, hooks, and UI all switch from `crew: string` to `crewMemberIds: number[]` on writes and `crewMembers: { id, name, role }[]` on reads. UI changes split cleanly: form panel extracts to its own file and gains a multi-select toggle grid; calendar chip renders a row of neutral avatar dots; new `CrewFilterBar` lives above `CalendarGrid` in `ScheduleView` with view-state lifted up; new `/crew` page hosts the roster admin.

**Tech Stack:** Next.js 16 (App Router), Prisma 7, Postgres, TypeScript, Zod 4, vitest 4, Playwright, TanStack Query 5, Biome 2.

**Reference spec:** `docs/superpowers/specs/2026-05-09-multi-crew-design.md`.

**Note on intermediate state:** Tasks 1–3 alter the schema. Until repositories and API are updated (Tasks 4–8) and hooks/UI follow (Tasks 9–17), `tsc --noEmit` and the test suite will fail at the boundary of the deleted `crew` field. Each later task drives a portion back to green. The full suite must be green by the end of Task 19.

**Working directory note:** Run all commands from `D:\Code\SqFt`. Database commands use `dotenv` to load `.env.dev.local`. Prefix migrations and seeds with `npx dotenv -e .env.dev.local --` locally, e.g. `npx dotenv -e .env.dev.local -- npx prisma migrate dev --name multi_crew`.

---

## File Map

### Created

- `prisma/migrations/<timestamp>_multi_crew/migration.sql`
- `lib/repositories/crewMemberRepo.ts`
- `__tests__/repositories/crewMemberRepo.test.ts` (deferred — repo is exercised through API tests)
- `app/api/crew-members/route.ts`
- `app/api/crew-members/[id]/route.ts`
- `__tests__/api/crew-members.test.ts`
- `lib/hooks/useCrewMembers.ts`
- `components/schedule/EventFormPanel.tsx`
- `components/schedule/CrewFilterBar.tsx`
- `__tests__/components/schedule/CrewFilterBar.test.tsx`
- `components/schedule/crewFilters.ts`
- `__tests__/components/schedule/crewFilters.test.ts`
- `components/crew/CrewRosterView.tsx`
- `app/(app)/crew/page.tsx`
- `components/ui/CrewAvatar.tsx`

### Modified

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `lib/repositories/eventRepo.ts`
- `lib/repositories/index.ts`
- `app/api/events/route.ts`
- `app/api/events/[id]/route.ts`
- `lib/hooks/useEvents.ts`
- `components/schedule/CalendarGrid.tsx`
- `components/dashboard/DashboardView.tsx`

---

## Phase 1 — Schema, migration, seed

### Task 1: Add `CrewMember` model + M:N relation in `schema.prisma`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `CrewMember` model and `crewMembers` relations**

Append the new model immediately after the `Event` model and add the back-references on `Organization` and `Event`. Final state:

```prisma
model Organization {
  id                 String   @id @default(cuid())
  name               String
  slug               String   @unique
  plan               String   @default("free")
  phone              String?
  address            String?
  licenseNumber      String?
  logo               String?
  nextEstimateNumber Int      @default(1)
  nextQuoteNumber    Int      @default(1)
  createdAt          DateTime @default(now())

  users        User[]
  customers    Customer[]
  estimates    Estimate[]
  quotes       Quote[]
  events       Event[]
  crewMembers  CrewMember[]
}

model Event {
  id          Int          @id @default(autoincrement())
  orgId       String
  org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  type        String
  title       String
  customerId  Int?
  customer    Customer?    @relation(fields: [customerId], references: [id], onDelete: SetNull)
  quoteId     Int?
  quote       Quote?       @relation(fields: [quoteId], references: [id], onDelete: SetNull)
  date        DateTime
  endDate     DateTime?
  startTime   String
  endTime     String
  crew        String?
  notes       String?
  createdAt   DateTime     @default(now())
  crewMembers CrewMember[]
}

model CrewMember {
  id        Int          @id @default(autoincrement())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  role      String       @default("")
  archived  Boolean      @default(false)
  createdAt DateTime     @default(now())

  events    Event[]

  @@index([orgId, archived])
}
```

Note: `Event.crew` is intentionally **not** removed yet — Task 2's migration drops it after backfilling, and removing it from the Prisma schema in the same step keeps `prisma migrate dev --create-only` from generating a divergent migration.

- [ ] **Step 2: Generate the migration shell**

```
npx dotenv -e .env.dev.local -- npx prisma migrate dev --name multi_crew --create-only
```

Expected: a new directory `prisma/migrations/<timestamp>_multi_crew/migration.sql` is created. Open it. It will contain `CREATE TABLE "CrewMember"`, `CREATE TABLE "_CrewMemberToEvent"`, indexes, and FKs. Leave it alone for now — Task 2 rewrites it to add backfill + drop.

- [ ] **Step 3: Commit**

```
git add prisma/schema.prisma prisma/migrations/<timestamp>_multi_crew/
git commit -m "feat(db): add CrewMember model + Event M:N (schema only)"
```

### Task 2: Rewrite the migration to backfill and drop `Event.crew`

**Files:**
- Modify: `prisma/migrations/<timestamp>_multi_crew/migration.sql`
- Modify: `prisma/schema.prisma` (remove `crew` field from `Event`)

- [ ] **Step 1: Replace migration SQL with the full version**

Replace the entire `migration.sql` with the following (keep the timestamp/dirname Prisma generated):

```sql
-- AlterTable: keep crew temporarily, will drop at the bottom
-- (Prisma's generator may have already added the new tables — keep those statements as-is, then append the BEGIN block below if Prisma wrapped it differently.)

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CrewMemberToEvent" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CrewMemberToEvent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "CrewMember_orgId_archived_idx" ON "CrewMember"("orgId", "archived");

-- CreateIndex
CREATE INDEX "_CrewMemberToEvent_B_index" ON "_CrewMemberToEvent"("B");

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrewMemberToEvent" ADD CONSTRAINT "_CrewMemberToEvent_A_fkey"
  FOREIGN KEY ("A") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrewMemberToEvent" ADD CONSTRAINT "_CrewMemberToEvent_B_fkey"
  FOREIGN KEY ("B") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one CrewMember row per distinct non-empty Event.crew per org.
INSERT INTO "CrewMember" ("orgId", "name")
SELECT DISTINCT "orgId", "crew"
FROM "Event"
WHERE "crew" IS NOT NULL AND "crew" <> '';

-- Backfill: connect each event with a non-empty crew string to its matching CrewMember.
INSERT INTO "_CrewMemberToEvent" ("A", "B")
SELECT cm."id", e."id"
FROM "Event" e
JOIN "CrewMember" cm
  ON cm."orgId" = e."orgId"
 AND cm."name" = e."crew"
WHERE e."crew" IS NOT NULL AND e."crew" <> '';

-- Sanity: every event with a crew string must now have exactly one join row.
DO $$
DECLARE
  expected INT;
  actual INT;
BEGIN
  SELECT COUNT(*) INTO expected FROM "Event" WHERE "crew" IS NOT NULL AND "crew" <> '';
  SELECT COUNT(*) INTO actual FROM "_CrewMemberToEvent";
  IF expected <> actual THEN
    RAISE EXCEPTION 'Crew backfill mismatch: expected % join rows, got %', expected, actual;
  END IF;
END $$;

-- DropColumn (after backfill verified)
ALTER TABLE "Event" DROP COLUMN "crew";
```

- [ ] **Step 2: Remove `crew` from the `Event` model**

In `prisma/schema.prisma`, remove the `crew String?` line from the `Event` model so the schema matches the post-migration database.

- [ ] **Step 3: Apply migration**

```
npx dotenv -e .env.dev.local -- npx prisma migrate dev
```

Expected: migration applies cleanly, no `RAISE EXCEPTION`. The Prisma client regenerates.

- [ ] **Step 4: Verify in the dev DB**

```
npx dotenv -e .env.dev.local -- npx prisma studio
```

Confirm `CrewMember` table has rows (one per distinct crew name per org) and `_CrewMemberToEvent` has rows. The `Event` table no longer has a `crew` column. Close studio.

- [ ] **Step 5: Commit**

```
git add prisma/schema.prisma prisma/migrations/<timestamp>_multi_crew/migration.sql
git commit -m "feat(db): backfill crew strings into CrewMember and drop Event.crew"
```

### Task 3: Update seed script

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add a crew member roster after `org` is created**

Find where `org` is created near the top of `main()`. Immediately after, insert:

```ts
  // ── Crew roster ───────────────────────────────────────────────────────────
  const [crewMike, crewCarlos, crewDave, crewSarah] = await Promise.all([
    prisma.crewMember.create({ data: { orgId: org.id, name: "Mike",   role: "Owner / Sales" } }),
    prisma.crewMember.create({ data: { orgId: org.id, name: "Carlos", role: "Lead Installer" } }),
    prisma.crewMember.create({ data: { orgId: org.id, name: "Dave",   role: "Installer" } }),
    prisma.crewMember.create({ data: { orgId: org.id, name: "Sarah",  role: "Showroom" } }),
  ]);
  console.log("  ✓ 4 crew members");
```

- [ ] **Step 2: Replace `crew: "Name"` with `crewMembers` connect on every event**

In the `prisma.event.createMany({ data: [...] })` block, every event currently has a `crew: "..."` field. `createMany` does not support nested writes — convert that block to sequential `prisma.event.create` calls so we can use `crewMembers: { connect: [...] }`.

Replace the entire `await prisma.event.createMany({ data: [ ... ] });` block with:

```ts
  await Promise.all([
    prisma.event.create({
      data: {
        orgId: org.id, type: "job", title: "Chen Staircase · Day 2",
        customerId: customers[2].id, quoteId: q5003.id,
        date: d(0), startTime: "08:00", endTime: "16:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "job", title: "Williams Tile Bath · Day 1",
        customerId: customers[5].id, quoteId: q5004.id,
        date: d(0), startTime: "08:30", endTime: "15:30",
        notes: "",
        crewMembers: { connect: [{ id: crewDave.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "visit", title: "Measure — Nguyen Residence",
        customerId: customers[4].id,
        date: d(0), startTime: "10:00", endTime: "11:00",
        notes: "",
        crewMembers: { connect: [{ id: crewMike.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "other", title: "Showroom — Park Family",
        customerId: customers[3].id,
        date: d(0), startTime: "14:00", endTime: "15:00",
        notes: "Material selection",
        crewMembers: { connect: [{ id: crewSarah.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "job", title: "Chen Staircase · Day 3",
        customerId: customers[2].id, quoteId: q5003.id,
        date: d(1), startTime: "08:00", endTime: "15:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }, { id: crewDave.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "job", title: "Martinez HW",
        customerId: customers[1].id, quoteId: q5002.id,
        date: d(3), startTime: "08:00", endTime: "16:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "visit", title: "Henderson follow-up",
        customerId: customers[0].id,
        date: d(4), startTime: "10:00", endTime: "11:00",
        notes: "",
        crewMembers: { connect: [{ id: crewMike.id }] },
      },
    }),
    prisma.event.create({
      data: {
        orgId: org.id, type: "job", title: "Henderson — Floor install",
        customerId: customers[0].id, quoteId: q5001.id,
        date: d(6), startTime: "08:00", endTime: "16:00",
        notes: "",
        crewMembers: { connect: [{ id: crewCarlos.id }] },
      },
    }),
  ]);
  console.log("  ✓ 8 calendar events");
```

Note: one event ("Chen Staircase · Day 3") now has two crew connected to demonstrate multi-crew.

- [ ] **Step 3: Re-run seed**

```
npx dotenv -e .env.dev.local -- npx prisma db push --force-reset --accept-data-loss
npx dotenv -e .env.dev.local -- npx prisma migrate deploy
npm run seed:dev
```

Expected: clean reset, migrations apply, seed runs without error and prints `✓ 4 crew members` and `✓ 8 calendar events`.

- [ ] **Step 4: Commit**

```
git add prisma/seed.ts
git commit -m "feat(db): seed CrewMember roster and connect events"
```

---

## Phase 2 — Repositories and API

### Task 4: Add `crewMemberRepo`

**Files:**
- Create: `lib/repositories/crewMemberRepo.ts`
- Modify: `lib/repositories/index.ts`

- [ ] **Step 1: Write the repo**

Create `lib/repositories/crewMemberRepo.ts`:

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CrewMemberWithCount = Prisma.CrewMemberGetPayload<{
  include: { _count: { select: { events: true } } };
}>;

export type CrewMemberSummary = {
  id: number;
  name: string;
  role: string;
};

export class CrewMemberInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrewMemberInUseError";
  }
}

export async function listCrewMembers(
  orgId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<CrewMemberWithCount[]> {
  return prisma.crewMember.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { events: true } } },
  });
}

export async function createCrewMember(
  orgId: string,
  data: { name: string; role?: string }
) {
  return prisma.crewMember.create({
    data: { orgId, name: data.name, role: data.role ?? "" },
  });
}

export async function updateCrewMember(
  id: number,
  orgId: string,
  data: { name?: string; role?: string; archived?: boolean }
) {
  const result = await prisma.crewMember.updateMany({
    where: { id, orgId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.crewMember.findFirst({ where: { id, orgId } });
}

export async function deleteCrewMember(id: number, orgId: string) {
  const member = await prisma.crewMember.findFirst({
    where: { id, orgId },
    include: { _count: { select: { events: true } } },
  });
  if (!member) return { ok: false as const, reason: "not-found" as const };
  if (member._count.events > 0) {
    throw new CrewMemberInUseError(
      "Crew member is assigned to events. Archive instead of deleting."
    );
  }
  await prisma.crewMember.delete({ where: { id } });
  return { ok: true as const };
}

/**
 * Validates that every id in `ids` belongs to `orgId`. Returns `true` if so,
 * `false` otherwise.
 */
export async function validateCrewMemberIds(
  orgId: string,
  ids: number[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.crewMember.count({
    where: { id: { in: ids }, orgId },
  });
  return count === ids.length;
}
```

- [ ] **Step 2: Re-export from the index**

In `lib/repositories/index.ts`, add a line:

```ts
export * from "./crewMemberRepo";
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

Expected: errors only in files that still reference `Event.crew` (events repo, events API, useEvents, CalendarGrid, DashboardView). Errors in `crewMemberRepo.ts` itself: none.

- [ ] **Step 4: Commit**

```
git add lib/repositories/crewMemberRepo.ts lib/repositories/index.ts
git commit -m "feat(repo): add crewMemberRepo with list/create/update/delete + validateIds"
```

### Task 5: Update `eventRepo` to read/write `crewMembers`

**Files:**
- Modify: `lib/repositories/eventRepo.ts`

- [ ] **Step 1: Update read shape and write inputs**

Replace the contents of `lib/repositories/eventRepo.ts` with:

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export type EventWithRelations = Prisma.EventGetPayload<{
  include: {
    customer: { select: { id: true; name: true; address: true } };
    crewMembers: { select: { id: true; name: true; role: true } };
  };
}>;

const includeRelations = {
  customer: { select: { id: true, name: true, address: true } },
  crewMembers: {
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" as const },
  },
} satisfies Prisma.EventInclude;

export async function listEvents(orgId: string): Promise<EventWithRelations[]> {
  return prisma.event.findMany({
    where: { orgId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: includeRelations,
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

export type EventCreateInput = Omit<
  Prisma.EventUncheckedCreateInput,
  "orgId" | "crewMembers"
> & {
  crewMemberIds?: number[];
};

export type EventUpdateInput = Prisma.EventUncheckedUpdateInput & {
  crewMemberIds?: number[];
};

export async function createEvent(orgId: string, data: EventCreateInput) {
  assertJobHasQuote(data.type, data.quoteId ?? null);
  const { crewMemberIds, ...rest } = data;
  return prisma.event.create({
    data: {
      ...rest,
      orgId,
      ...(crewMemberIds && crewMemberIds.length > 0
        ? { crewMembers: { connect: crewMemberIds.map((id) => ({ id })) } }
        : {}),
    },
    include: includeRelations,
  });
}

export async function updateEvent(
  id: number,
  orgId: string,
  data: EventUpdateInput
) {
  const current = await prisma.event.findFirst({
    where: { id, orgId },
    select: { type: true, quoteId: true },
  });
  if (!current) return null;

  const nextType = typeof data.type === "string" ? data.type : current.type;
  const nextQuoteId =
    data.quoteId === undefined
      ? current.quoteId
      : (data.quoteId as number | null);
  assertJobHasQuote(nextType, nextQuoteId);

  const { crewMemberIds, ...rest } = data;

  // Use prisma.event.update (single row) so we can pass `set` for the relation.
  // Verify ownership first since `update` ignores `where: { orgId }`.
  const owned = await prisma.event.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.event.update({
    where: { id },
    data: {
      ...rest,
      ...(crewMemberIds !== undefined
        ? { crewMembers: { set: crewMemberIds.map((cid) => ({ id: cid })) } }
        : {}),
    },
    include: includeRelations,
  });
}

export async function deleteEvent(id: number, orgId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: errors remaining are now confined to API routes (`app/api/events/*`), `useEvents`, `CalendarGrid`, and `DashboardView` — all referencing the dropped `crew` field. The repo file itself: no errors.

- [ ] **Step 3: Commit**

```
git add lib/repositories/eventRepo.ts
git commit -m "feat(repo): switch eventRepo to crewMemberIds and include crewMembers on reads"
```

### Task 6: Update events API routes

**Files:**
- Modify: `app/api/events/route.ts`
- Modify: `app/api/events/[id]/route.ts`

- [ ] **Step 1: Update POST handler**

Replace `app/api/events/route.ts` with:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createEvent,
  listEvents,
  validateCrewMemberIds,
} from "@/lib/repositories";
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
  crewMemberIds: z.array(z.number().int().positive()).max(20).optional(),
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

    const { endDate, crewMemberIds, ...rest } = parsed.data;

    if (crewMemberIds && crewMemberIds.length > 0) {
      const ok = await validateCrewMemberIds(orgId, crewMemberIds);
      if (!ok) {
        return NextResponse.json(
          { error: "Invalid crew member" },
          { status: 400 }
        );
      }
    }

    const event = await createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
      ...(crewMemberIds ? { crewMemberIds } : {}),
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

- [ ] **Step 2: Update PATCH handler**

Replace `app/api/events/[id]/route.ts` with:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import {
  deleteEvent,
  updateEvent,
  validateCrewMemberIds,
} from "@/lib/repositories";
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
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  crewMemberIds: z.array(z.number().int().positive()).max(20).optional(),
  notes: z.string().max(2000).optional(),
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

      const { date, endDate, crewMemberIds, ...rest } = parsed.data;

      if (crewMemberIds && crewMemberIds.length > 0) {
        const ok = await validateCrewMemberIds(orgId, crewMemberIds);
        if (!ok) {
          return NextResponse.json(
            { error: "Invalid crew member" },
            { status: 400 }
          );
        }
      }

      const data = {
        ...rest,
        ...(date ? { date: new Date(date) } : {}),
        ...(endDate !== undefined
          ? { endDate: endDate ? new Date(endDate) : null }
          : {}),
        ...(crewMemberIds !== undefined ? { crewMemberIds } : {}),
      };

      const event = await updateEvent(parseInt(id, 10), orgId, data);
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

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

Expected: errors confined to `useEvents.ts`, `CalendarGrid.tsx`, `DashboardView.tsx`. Events API and repo: clean.

- [ ] **Step 4: Commit**

```
git add app/api/events/route.ts app/api/events/[id]/route.ts
git commit -m "feat(api): events accept crewMemberIds and return crewMembers"
```

### Task 7: Add `/api/crew-members` routes

**Files:**
- Create: `app/api/crew-members/route.ts`
- Create: `app/api/crew-members/[id]/route.ts`

- [ ] **Step 1: Write GET + POST**

Create `app/api/crew-members/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCrewMember, listCrewMembers } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(100).optional(),
});

export const GET = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const includeArchived =
      req.nextUrl.searchParams.get("includeArchived") === "1";
    const members = await listCrewMembers(orgId, { includeArchived });
    return NextResponse.json(members);
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
    const member = await createCrewMember(orgId, parsed.data);
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 2: Write PATCH + DELETE**

Create `app/api/crew-members/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CrewMemberInUseError,
  deleteCrewMember,
  updateCrewMember,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().max(100).optional(),
  archived: z.boolean().optional(),
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
      const member = await updateCrewMember(
        parseInt(id, 10),
        orgId,
        parsed.data
      );
      if (!member)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(member);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const result = await deleteCrewMember(parseInt(id, 10), orgId);
      if (!result.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof CrewMemberInUseError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

Expected: only `useEvents.ts`, `CalendarGrid.tsx`, `DashboardView.tsx` should still error.

- [ ] **Step 4: Commit**

```
git add app/api/crew-members/route.ts app/api/crew-members/[id]/route.ts
git commit -m "feat(api): /api/crew-members CRUD with soft-delete + 409 on hard-delete-with-events"
```

### Task 8: Tests for `/api/crew-members`

**Files:**
- Create: `__tests__/api/crew-members.test.ts`

- [ ] **Step 1: Look at an existing API test to confirm style**

Read `__tests__/api/quotes.test.ts` (created in the prior quotes-split work) for the exact mocking pattern used in this codebase. Match it. (If it doesn't exist, fall through to step 2 and use the pattern below.)

- [ ] **Step 2: Write the test**

Create `__tests__/api/crew-members.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth + repos before route imports.
vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(),
}));
vi.mock("@/lib/repositories", () => ({
  listCrewMembers: vi.fn(),
  createCrewMember: vi.fn(),
  updateCrewMember: vi.fn(),
  deleteCrewMember: vi.fn(),
  CrewMemberInUseError: class CrewMemberInUseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CrewMemberInUseError";
    }
  },
}));

import {
  createCrewMember,
  CrewMemberInUseError,
  deleteCrewMember,
  listCrewMembers,
  updateCrewMember,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { GET, POST } from "@/app/api/crew-members/route";
import { DELETE, PATCH } from "@/app/api/crew-members/[id]/route";

const ORG = "org_1";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOrgId).mockResolvedValue(ORG);
});

function jsonReq(url: string, body: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/crew-members", () => {
  it("returns active members by default", async () => {
    vi.mocked(listCrewMembers).mockResolvedValue([
      { id: 1, orgId: ORG, name: "Carlos", role: "", archived: false, createdAt: new Date(), _count: { events: 3 } } as any,
    ]);
    const req = new NextRequest("http://x/api/crew-members");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(listCrewMembers).toHaveBeenCalledWith(ORG, { includeArchived: false });
  });

  it("respects ?includeArchived=1", async () => {
    vi.mocked(listCrewMembers).mockResolvedValue([]);
    const req = new NextRequest("http://x/api/crew-members?includeArchived=1");
    await GET(req);
    expect(listCrewMembers).toHaveBeenCalledWith(ORG, { includeArchived: true });
  });
});

describe("POST /api/crew-members", () => {
  it("creates and returns 201", async () => {
    vi.mocked(createCrewMember).mockResolvedValue({
      id: 9, orgId: ORG, name: "Pat", role: "Helper", archived: false, createdAt: new Date(),
    } as any);
    const res = await POST(jsonReq("http://x/api/crew-members", { name: "Pat", role: "Helper" }));
    expect(res.status).toBe(201);
    expect(createCrewMember).toHaveBeenCalledWith(ORG, { name: "Pat", role: "Helper" });
  });

  it("rejects empty name with 400", async () => {
    const res = await POST(jsonReq("http://x/api/crew-members", { name: "" }));
    expect(res.status).toBe(400);
    expect(createCrewMember).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/crew-members/[id]", () => {
  it("updates and returns the row", async () => {
    vi.mocked(updateCrewMember).mockResolvedValue({
      id: 5, orgId: ORG, name: "Mike", role: "Owner", archived: false, createdAt: new Date(),
    } as any);
    const req = jsonReq("http://x/api/crew-members/5", { archived: true }, "PATCH");
    const res = await PATCH(req, { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(200);
    expect(updateCrewMember).toHaveBeenCalledWith(5, ORG, { archived: true });
  });

  it("returns 404 when row missing for org", async () => {
    vi.mocked(updateCrewMember).mockResolvedValue(null);
    const req = jsonReq("http://x/api/crew-members/999", { name: "X" }, "PATCH");
    const res = await PATCH(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/crew-members/[id]", () => {
  it("returns 200 on successful hard delete", async () => {
    vi.mocked(deleteCrewMember).mockResolvedValue({ ok: true });
    const req = new NextRequest("http://x/api/crew-members/5", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(deleteCrewMember).mockResolvedValue({ ok: false, reason: "not-found" });
    const req = new NextRequest("http://x/api/crew-members/999", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });

  it("returns 409 when crew member is in use", async () => {
    vi.mocked(deleteCrewMember).mockRejectedValue(
      new CrewMemberInUseError("in use")
    );
    const req = new NextRequest("http://x/api/crew-members/5", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run the test**

```
npm test -- crew-members
```

Expected: all tests in this file pass.

- [ ] **Step 4: Commit**

```
git add __tests__/api/crew-members.test.ts
git commit -m "test(api): cover crew-members CRUD + 409-in-use"
```

---

## Phase 3 — Hooks

### Task 9: Update `useEvents` types and add `useCrewMembers`

**Files:**
- Modify: `lib/hooks/useEvents.ts`
- Create: `lib/hooks/useCrewMembers.ts`

- [ ] **Step 1: Update `useEvents.ts`**

Replace `lib/hooks/useEvents.ts` with:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CrewMemberSummary {
  id: number;
  name: string;
  role: string;
}

export interface CalEvent {
  id: number;
  orgId: string;
  type: "job" | "visit" | "other";
  title: string;
  customerId?: number | null;
  estimateId?: number | null;
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  crewMembers: CrewMemberSummary[];
  notes?: string | null;
  createdAt: string;
  customer?: { id: number; name: string; address?: string | null } | null;
}

export interface CreateEventInput {
  type: "job" | "visit" | "other";
  title: string;
  customerId?: number;
  estimateId?: number;
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  crewMemberIds?: number[];
  notes?: string;
}

async function fetchEvents(): Promise<CalEvent[]> {
  const res = await fetch("/api/events");
  if (!res.ok) throw new Error("Failed to fetch events");
  return res.json();
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create event");
      return res.json() as Promise<CalEvent>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUpdateEvent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CreateEventInput>) => {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update event");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/events/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
```

- [ ] **Step 2: Create `useCrewMembers.ts`**

Create `lib/hooks/useCrewMembers.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CrewMember {
  id: number;
  orgId: string;
  name: string;
  role: string;
  archived: boolean;
  createdAt: string;
  _count?: { events: number };
}

export interface CreateCrewMemberInput {
  name: string;
  role?: string;
}

export interface UpdateCrewMemberInput {
  name?: string;
  role?: string;
  archived?: boolean;
}

async function fetchCrewMembers(includeArchived: boolean): Promise<CrewMember[]> {
  const url = includeArchived
    ? "/api/crew-members?includeArchived=1"
    : "/api/crew-members";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch crew members");
  return res.json();
}

export function useCrewMembers(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: ["crew-members", { includeArchived }],
    queryFn: () => fetchCrewMembers(includeArchived),
  });
}

export function useCreateCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCrewMemberInput) => {
      const res = await fetch("/api/crew-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create crew member");
      return res.json() as Promise<CrewMember>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-members"] }),
  });
}

export function useUpdateCrewMember(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateCrewMemberInput) => {
      const res = await fetch(`/api/crew-members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update crew member");
      return res.json() as Promise<CrewMember>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-members"] }),
  });
}

export function useDeleteCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/crew-members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to delete crew member");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-members"] }),
  });
}
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

Expected: only `CalendarGrid.tsx` and `DashboardView.tsx` still error (referencing the removed `crew` field).

- [ ] **Step 4: Commit**

```
git add lib/hooks/useEvents.ts lib/hooks/useCrewMembers.ts
git commit -m "feat(hooks): switch useEvents to crewMemberIds and add useCrewMembers"
```

---

## Phase 4 — Shared UI primitives + filter helper

### Task 10: Add `CrewAvatar` UI primitive

**Files:**
- Create: `components/ui/CrewAvatar.tsx`

- [ ] **Step 1: Write the component**

Create `components/ui/CrewAvatar.tsx`:

```tsx
import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "w-[10px] h-[10px] text-[7px]",
  md: "w-[18px] h-[18px] text-[9px]",
  lg: "w-[20px] h-[20px] text-[10px]",
};

interface CrewAvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

export function CrewAvatar({ name, size = "md", className }: CrewAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[var(--ink-2)] text-white font-[700] font-[var(--font-mono)] flex-shrink-0",
        SIZES[size],
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```
git add components/ui/CrewAvatar.tsx
git commit -m "feat(ui): add CrewAvatar primitive (single neutral fill, initial)"
```

### Task 11: Add `crewFilters` helper + tests

**Files:**
- Create: `components/schedule/crewFilters.ts`
- Create: `__tests__/components/schedule/crewFilters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/schedule/crewFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  eventMatchesCrew,
  weekCrewCounts,
  type CrewFilter,
  type EventForCrew,
} from "@/components/schedule/crewFilters";

const events: EventForCrew[] = [
  { id: 1, date: "2026-05-04", crewMembers: [{ id: 10, name: "Carlos", role: "" }] },
  { id: 2, date: "2026-05-05", crewMembers: [{ id: 10, name: "Carlos", role: "" }, { id: 11, name: "Dave", role: "" }] },
  { id: 3, date: "2026-05-05", crewMembers: [] },
  { id: 4, date: "2026-05-12", crewMembers: [{ id: 10, name: "Carlos", role: "" }] },
];

describe("eventMatchesCrew", () => {
  it("'all' matches every event", () => {
    expect(events.every((e) => eventMatchesCrew(e, "all"))).toBe(true);
  });
  it("a numeric filter matches when the crew is on the event", () => {
    expect(eventMatchesCrew(events[0], 10)).toBe(true);
    expect(eventMatchesCrew(events[1], 11)).toBe(true);
  });
  it("does not match when the crew is not on the event", () => {
    expect(eventMatchesCrew(events[0], 11)).toBe(false);
  });
  it("never matches an event with no crew when a specific filter is active", () => {
    expect(eventMatchesCrew(events[2], 10)).toBe(false);
  });
});

describe("weekCrewCounts", () => {
  const weekStart = "2026-05-04"; // Monday
  it("counts events per crewMember within the visible week", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get(10)).toBe(2); // events 1 and 2 (event 4 is next week)
    expect(counts.get(11)).toBe(1); // event 2
  });
  it("returns total across all events in the week as the 'all' bucket", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get("all")).toBe(3); // events 1, 2, 3
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- crewFilters
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

Create `components/schedule/crewFilters.ts`:

```ts
export type CrewFilter = "all" | number;

export type EventForCrew = {
  id: number;
  date: string; // ISO date "YYYY-MM-DD"
  crewMembers: { id: number; name: string; role: string }[];
};

export function eventMatchesCrew(event: EventForCrew, filter: CrewFilter): boolean {
  if (filter === "all") return true;
  return event.crewMembers.some((m) => m.id === filter);
}

/**
 * Count events per crew member that fall within a [weekStart, weekStart+days) window.
 * Returns counts keyed by crew id, plus a special "all" key for the total event
 * count in the window (regardless of crew).
 */
export function weekCrewCounts(
  events: EventForCrew[],
  weekStart: string,
  days: number
): Map<number | "all", number> {
  const startMs = Date.parse(`${weekStart}T00:00:00`);
  const endMs = startMs + days * 86_400_000;
  const counts = new Map<number | "all", number>();

  for (const ev of events) {
    const ms = Date.parse(`${ev.date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(ms) || ms < startMs || ms >= endMs) continue;

    counts.set("all", (counts.get("all") ?? 0) + 1);
    for (const m of ev.crewMembers) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
  }
  return counts;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- crewFilters
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add components/schedule/crewFilters.ts __tests__/components/schedule/crewFilters.test.ts
git commit -m "feat(schedule): add crewFilters helper (eventMatchesCrew, weekCrewCounts) + tests"
```

---

## Phase 5 — Schedule UI

### Task 12: Extract `EventFormPanel` to its own file

**Files:**
- Create: `components/schedule/EventFormPanel.tsx`
- Modify: `components/schedule/CalendarGrid.tsx`

This is a pure refactor — no behavior change. The crew toggle grid lands in Task 13 on top of this extraction.

- [ ] **Step 1: Move the `EventFormPanel` function and its props**

Read the current `EventFormPanel` in `components/schedule/CalendarGrid.tsx` (starts around line 407, ends with the closing brace of the function). Cut everything from `interface EventFormPanelProps {` through the end of the `EventFormPanel` function.

Create `components/schedule/EventFormPanel.tsx` and paste it in. Add this import block at the top:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { cn } from "@/lib/cn";
import type { CalEvent, CreateEventInput } from "@/lib/hooks/useEvents";
```

Export the component: change `function EventFormPanel(` to `export function EventFormPanel(`.

If the panel pulled any helpers (`labelClass`, `inputClass`, etc.) from local consts in `CalendarGrid.tsx`, copy those into `EventFormPanel.tsx` too — but only the ones the panel actually uses.

Temporarily keep the **old** `crew: ""` state field exactly as it is and the existing `<select>` for crew — Task 13 replaces them. The point of Task 12 is to land the file split with **zero behavior change**.

- [ ] **Step 2: Update `CalendarGrid.tsx` to import the extracted panel**

In `components/schedule/CalendarGrid.tsx`, remove the in-file `EventFormPanel` function and `EventFormPanelProps` interface. Add an import at the top:

```tsx
import { EventFormPanel } from "@/components/schedule/EventFormPanel";
```

Note: the existing `<EventFormPanel ... />` JSX in `ScheduleView` keeps the same prop shape — no prop changes in this task.

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

Expected: errors remaining are still about `ev.crew`/`crew` field — they were already there before this task. The extraction itself adds no new errors.

- [ ] **Step 4: Smoke test**

```
npm run dev
```

Open the schedule page, click `+ Add Event`, fill in a title, save. Click an existing event to edit. Confirm both flows still work as before. Stop the dev server.

- [ ] **Step 5: Commit**

```
git add components/schedule/EventFormPanel.tsx components/schedule/CalendarGrid.tsx
git commit -m "refactor(schedule): extract EventFormPanel from CalendarGrid (no behavior change)"
```

### Task 13: Replace crew `<select>` with multi-select toggle grid in `EventFormPanel`

**Files:**
- Modify: `components/schedule/EventFormPanel.tsx`
- Modify: `components/schedule/CalendarGrid.tsx` (only to drop the now-defunct `customers`/`estimates` filtering of crew names — verify by reading the diff)

- [ ] **Step 1: Replace the `crew` state and `<select>` with a `Set<number>`**

In `components/schedule/EventFormPanel.tsx`:

Add imports:

```tsx
import Link from "next/link";
import { useCrewMembers } from "@/lib/hooks/useCrewMembers";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
```

Replace the `const [crew, setCrew] = useState("");` line with:

```tsx
  const [crewMemberIds, setCrewMemberIds] = useState<Set<number>>(new Set());
  const { data: crew = [], isLoading: crewLoading } = useCrewMembers();
```

Find the `useEffect` that populates state when `editingEvent` changes (or the initial state setup if there's no effect — there's a `useEffect` near the top of the component). Inside it, replace the `setCrew(ev?.crew ?? "")` line with:

```tsx
      setCrewMemberIds(new Set((ev?.crewMembers ?? []).map((m) => m.id)));
```

In the `handleSave` function, replace the `crew,` field in the call to `onSave({...})` with:

```tsx
        crewMemberIds: Array.from(crewMemberIds),
```

- [ ] **Step 2: Replace the crew `<select>` JSX with the toggle grid**

Find the existing crew block (it uses `labelClass` and a `<select>`). Replace the entire block with:

```tsx
        <div>
          <div className={labelClass}>
            Crew{" "}
            <span className="text-[var(--muted)] font-[400]">
              (tap to assign — multiple OK)
            </span>
          </div>
          {crewLoading ? (
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[36px] rounded-[6px] bg-[var(--surface-2)] animate-pulse"
                />
              ))}
            </div>
          ) : crew.length === 0 ? (
            <div className="text-[12px] text-[var(--muted)]">
              No crew yet.{" "}
              <Link href="/crew" className="underline hover:text-[var(--ink)]">
                Add crew members →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {crew.map((m) => {
                const active = crewMemberIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      const next = new Set(crewMemberIds);
                      if (active) next.delete(m.id);
                      else next.add(m.id);
                      setCrewMemberIds(next);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 px-2.5 py-2 rounded-[6px]",
                      "text-[13px] font-[500] tracking-[-0.005em] text-left transition-[background,border-color] duration-150",
                      "border",
                      active
                        ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                        : "bg-[var(--surface)] text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]"
                    )}
                  >
                    <CrewAvatar name={m.name} size="lg" />
                    <span className="truncate">{m.name}</span>
                    {active && <span className="ml-auto text-[12px] font-[600]">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-2 tracking-[0.02em]">
            {crewMemberIds.size === 0
              ? "No crew assigned"
              : `${crewMemberIds.size} assigned`}
          </div>
        </div>
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

Expected: errors remaining are only about `ev.crew` references in `CalendarGrid.tsx` (the calendar chip subtitle) and `DashboardView.tsx`. The form panel itself: clean.

- [ ] **Step 4: Smoke test**

```
npm run dev
```

Open the schedule, click `+ Add Event`. Verify:
- Crew section shows toggle grid with 4 members (Mike, Carlos, Dave, Sarah).
- Clicking toggles the active state.
- "X assigned" updates.
- Saving creates an event with the right `crewMemberIds`.
- Editing an existing event preselects the right toggles.

Stop the dev server.

- [ ] **Step 5: Commit**

```
git add components/schedule/EventFormPanel.tsx
git commit -m "feat(schedule): multi-select crew toggle grid in event form panel"
```

### Task 14: Render avatar dots on calendar event chips

**Files:**
- Modify: `components/schedule/CalendarGrid.tsx`

- [ ] **Step 1: Replace the crew text line with avatar dots**

In `components/schedule/CalendarGrid.tsx`, find the chip rendering block (around line 354 — the `<div className="text-[11px] font-[600]...">` for `ev.title`, then the time row, then the crew row).

Add at the top of the file:

```tsx
import { CrewAvatar } from "@/components/ui/CrewAvatar";
```

Replace the existing crew block:

```tsx
                        {height > 46 && ev.crew && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-75 mt-px">
                            {ev.crew}
                          </div>
                        )}
```

with:

```tsx
                        {height > 46 && ev.crewMembers.length > 0 && (
                          <div className="font-[var(--font-mono)] text-[9px] opacity-75 mt-px flex items-center gap-1 truncate">
                            <span className="flex items-center gap-[2px] flex-shrink-0">
                              {ev.crewMembers.slice(0, 3).map((m) => (
                                <CrewAvatar key={m.id} name={m.name} size="sm" />
                              ))}
                              {ev.crewMembers.length > 3 && (
                                <span className="ml-[2px]">+{ev.crewMembers.length - 3}</span>
                              )}
                            </span>
                            <span className="truncate">
                              {ev.crewMembers.map((m) => m.name).join(" · ")}
                            </span>
                          </div>
                        )}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: only `DashboardView.tsx` still errors on the dropped `crew` field.

- [ ] **Step 3: Smoke test**

```
npm run dev
```

Open the schedule. Confirm event chips with crew show neutral dots + names. Stop the dev server.

- [ ] **Step 4: Commit**

```
git add components/schedule/CalendarGrid.tsx
git commit -m "feat(schedule): render crew avatar dots on calendar event chips"
```

### Task 15: Add `CrewFilterBar` component + tests

**Files:**
- Create: `components/schedule/CrewFilterBar.tsx`
- Create: `__tests__/components/schedule/CrewFilterBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/schedule/CrewFilterBar.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrewFilterBar } from "@/components/schedule/CrewFilterBar";

const crew = [
  { id: 10, name: "Carlos", role: "Lead Installer" },
  { id: 11, name: "Dave", role: "Installer" },
];
const events = [
  { id: 1, date: "2026-05-04", crewMembers: [crew[0]] },
  { id: 2, date: "2026-05-05", crewMembers: [crew[0], crew[1]] },
];

describe("CrewFilterBar", () => {
  it("renders an 'All' chip + one chip per crew member", () => {
    render(
      <CrewFilterBar
        crew={crew}
        events={events}
        weekStart="2026-05-04"
        days={7}
        active="all"
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/All/i)).toBeTruthy();
    expect(screen.getByText("Carlos")).toBeTruthy();
    expect(screen.getByText("Dave")).toBeTruthy();
  });

  it("shows correct counts in the visible week", () => {
    render(
      <CrewFilterBar
        crew={crew}
        events={events}
        weekStart="2026-05-04"
        days={7}
        active="all"
        onChange={() => {}}
      />
    );
    // Total events in week = 2; Carlos appears in 2; Dave in 1.
    const meta = screen.getByText(/Showing/i).textContent ?? "";
    expect(meta).toMatch(/all crews/i);
    expect(meta).toMatch(/2 events/i);
  });

  it("calls onChange when a crew chip is clicked", () => {
    const onChange = vi.fn();
    render(
      <CrewFilterBar
        crew={crew}
        events={events}
        weekStart="2026-05-04"
        days={7}
        active="all"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("Carlos"));
    expect(onChange).toHaveBeenCalledWith(10);
  });
});
```

This test file uses `@testing-library/react`. If it's not in the project, add it as a dev dep first:

```
npm install -D @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom
```

Then update `vitest.config.ts` to add `environment: "jsdom"` for tsx test files. The simplest approach: change `environment: "node"` to a per-file override using `// @vitest-environment jsdom` comments at the top of the test file. Add this comment as the first line of the test file:

```
// @vitest-environment jsdom
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- CrewFilterBar
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/schedule/CrewFilterBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { cn } from "@/lib/cn";
import {
  type CrewFilter,
  type EventForCrew,
  weekCrewCounts,
} from "@/components/schedule/crewFilters";

interface CrewFilterBarProps {
  crew: { id: number; name: string; role: string }[];
  events: EventForCrew[];
  weekStart: string; // "YYYY-MM-DD"
  days: number;
  active: CrewFilter;
  onChange: (next: CrewFilter) => void;
}

export function CrewFilterBar({
  crew,
  events,
  weekStart,
  days,
  active,
  onChange,
}: CrewFilterBarProps) {
  const counts = weekCrewCounts(events, weekStart, days);
  const total = counts.get("all") ?? 0;
  const activeName =
    active === "all" ? null : crew.find((c) => c.id === active)?.name ?? null;
  const focusCount = active === "all" ? total : counts.get(active) ?? 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 mb-3.5 px-3.5 py-2.5",
        "bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r)]",
        "flex-wrap"
      )}
    >
      <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] font-[600] text-[var(--muted)]">
        CREW
      </div>
      <div className="flex gap-1.5 flex-wrap flex-1">
        <button
          type="button"
          onClick={() => onChange("all")}
          className={cn(
            "inline-flex items-center gap-[7px] px-3 py-[5px] rounded-full border cursor-pointer",
            "font-[var(--font-mono)] text-[11px] tracking-[0.01em] transition-[background,color,border-color] duration-150",
            active === "all"
              ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
              : "bg-transparent text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]"
          )}
        >
          All
          <span
            className={cn(
              "font-[var(--font-mono)] text-[10px] font-[500] tracking-[0.04em]",
              active === "all" ? "text-[var(--bg)] opacity-70" : "text-[var(--muted)]"
            )}
          >
            {total}
          </span>
        </button>
        {crew.map((m) => {
          const isActive = active === m.id;
          const c = counts.get(m.id) ?? 0;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={cn(
                "inline-flex items-center gap-[7px] pl-1.5 pr-2.5 py-[5px] rounded-full border cursor-pointer",
                "font-[var(--font-mono)] text-[11px] tracking-[0.01em] transition-[background,color,border-color] duration-150",
                isActive
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                  : "bg-transparent text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]"
              )}
            >
              <CrewAvatar name={m.name} size="md" />
              {m.name}
              <span
                className={cn(
                  "font-[var(--font-mono)] text-[10px] font-[500] tracking-[0.04em]",
                  isActive ? "text-[var(--bg)] opacity-70" : "text-[var(--muted)]"
                )}
              >
                {c}
              </span>
            </button>
          );
        })}
      </div>
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[0.02em]">
        {activeName ? (
          <>
            Filtered to <strong className="text-[var(--ink)] font-[600]">{activeName}</strong>{" "}
            · {focusCount} event{focusCount === 1 ? "" : "s"} this week
          </>
        ) : (
          <>
            Showing <strong className="text-[var(--ink)] font-[600]">all crews</strong>{" "}
            · {total} event{total === 1 ? "" : "s"} this week
          </>
        )}
      </div>
      <Link
        href="/crew"
        aria-label="Manage crew"
        className="text-[var(--muted)] hover:text-[var(--ink)] text-[14px] leading-none px-1"
        title="Manage crew"
      >
        ⚙
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- CrewFilterBar
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add components/schedule/CrewFilterBar.tsx __tests__/components/schedule/CrewFilterBar.test.tsx vitest.config.ts package.json
git commit -m "feat(schedule): add CrewFilterBar component (single-select with counts) + tests"
```

### Task 16: Wire `CrewFilterBar` into `ScheduleView` and apply dim to non-matching events

**Files:**
- Modify: `components/schedule/CalendarGrid.tsx`

- [ ] **Step 1: Lift filter state into `ScheduleView` and render the bar**

In `components/schedule/CalendarGrid.tsx`, add imports at the top:

```tsx
import { CrewFilterBar } from "@/components/schedule/CrewFilterBar";
import { useCrewMembers } from "@/lib/hooks/useCrewMembers";
import { eventMatchesCrew, type CrewFilter } from "@/components/schedule/crewFilters";
```

Inside `ScheduleView`, add state right after the existing `useState` calls:

```tsx
  const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");
  const { data: crew = [] } = useCrewMembers();
```

Find the JSX `return` of `ScheduleView`. The schedule view currently renders a header + the calendar in a wrapping div. Add the filter bar **above** the calendar (and below any existing summary/header). Locate the line just before `<div className="cal">` or its equivalent — search for the calendar grid root that renders `days.map(...)`. Insert before that root:

```tsx
        <CrewFilterBar
          crew={crew.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
          events={events}
          weekStart={weekStart ? dateStr(weekStart) : ""}
          days={daysToShow}
          active={crewFilter}
          onChange={setCrewFilter}
        />
```

- [ ] **Step 2: Apply dim class to the calendar root and `crew-match` to matching chips**

Find the wrapping element that contains `days.map(...)` and the time column. It's currently a single `<div>`. Add a conditional class:

```tsx
                  className={cn(
                    "...existing classes...",
                    crewFilter !== "all" && "cal-crew-focus"
                  )}
```

(Use whatever the existing `className` is; only the `crewFilter !== "all" && "cal-crew-focus"` addition is new.)

On the event chip `<button>`, add the class `cal-event` (it may not have it yet — add it) and conditionally add `crew-match`:

```tsx
                        className={cn(
                          "cal-event",
                          eventMatchesCrew(ev, crewFilter) && "crew-match",
                          /* existing classes */
                        )}
```

- [ ] **Step 3: Add the dim CSS**

Open `app/globals.css`. Append:

```css
.cal-crew-focus .cal-event {
  opacity: 0.18;
  filter: saturate(0.4);
}
.cal-crew-focus .cal-event.crew-match {
  opacity: 1;
  filter: none;
}
```

- [ ] **Step 4: Typecheck and smoke test**

```
npx tsc --noEmit
```

Expected: only `DashboardView.tsx` still errors on `ev.crew`.

```
npm run dev
```

Open the schedule. Verify:
- Crew filter bar renders above the calendar with All + 4 crew chips and counts.
- Clicking "Carlos" dims non-Carlos events.
- Clicking "All" restores full opacity.
- Switching weeks preserves the active filter.
- Clicking the gear icon navigates to `/crew` (will 404 until Task 18 — that's expected).

Stop the dev server.

- [ ] **Step 5: Commit**

```
git add components/schedule/CalendarGrid.tsx app/globals.css
git commit -m "feat(schedule): render CrewFilterBar above calendar and dim non-matching events"
```

### Task 17: Update `DashboardView` to render crew avatar dots

**Files:**
- Modify: `components/dashboard/DashboardView.tsx`

- [ ] **Step 1: Replace the `ev.crew` string with avatar dots + joined names**

Read `components/dashboard/DashboardView.tsx` around line 130–145 (the event subtitle composition). Find the block:

```tsx
              const subParts = [
                ev.crew,
                ev.customer?.address?.split(",")[0],
              ].filter(Boolean);
```

Replace it with explicit JSX. Add an import at the top:

```tsx
import { CrewAvatar } from "@/components/ui/CrewAvatar";
```

Replace the `ev.crew` reference and the surrounding subtitle render. The exact change depends on what the surrounding markup looks like — open the file and verify line numbers first. Conceptually:

- Where the subtitle was rendered as plain text from `subParts.join(" · ")`, render instead:
  - if `ev.crewMembers.length > 0`: `[avatar dots] [name1 · name2 ...] · [address line]`
  - if `ev.crewMembers.length === 0`: `[address line]` only.

Concretely, a reasonable replacement (substitute into the existing markup at the same place the old subtitle rendered):

```tsx
              const addressLine = ev.customer?.address?.split(",")[0];
              const hasCrew = ev.crewMembers.length > 0;
              // ...
              <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] flex items-center gap-1.5 truncate">
                {hasCrew && (
                  <span className="flex items-center gap-[2px] flex-shrink-0">
                    {ev.crewMembers.slice(0, 3).map((m) => (
                      <CrewAvatar key={m.id} name={m.name} size="sm" />
                    ))}
                  </span>
                )}
                <span className="truncate">
                  {hasCrew && (ev.crewMembers.map((m) => m.name).join(" · "))}
                  {hasCrew && addressLine && " · "}
                  {addressLine}
                </span>
              </div>
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean. No more `ev.crew` references anywhere in `app/`, `components/`, or `lib/`.

- [ ] **Step 3: Smoke test**

```
npm run dev
```

Open the dashboard. Verify event rows show avatar dots followed by names and address. Stop the dev server.

- [ ] **Step 4: Commit**

```
git add components/dashboard/DashboardView.tsx
git commit -m "feat(dashboard): render crew avatar dots in event subtitle"
```

---

## Phase 6 — Roster page

### Task 18: Roster admin page at `/crew`

**Files:**
- Create: `components/crew/CrewRosterView.tsx`
- Create: `app/(app)/crew/page.tsx`

- [ ] **Step 1: Write `CrewRosterView`**

Create `components/crew/CrewRosterView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  type CrewMember,
  useCreateCrewMember,
  useCrewMembers,
  useUpdateCrewMember,
} from "@/lib/hooks/useCrewMembers";

export function CrewRosterView() {
  const { data: all = [], isLoading } = useCrewMembers({ includeArchived: true });
  const create = useCreateCrewMember();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = all.filter((m) => !m.archived);
  const archived = all.filter((m) => m.archived);

  return (
    <div className="max-w-[640px] mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] font-[700] tracking-[-0.02em]">Crew</h1>
        {!adding && (
          <Button onClick={() => setAdding(true)}>+ Add crew member</Button>
        )}
      </div>

      {adding && (
        <AddRow
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            try {
              await create.mutateAsync(input);
              setAdding(false);
              showToast("Crew member added");
            } catch {
              showToast("Failed to add crew member");
            }
          }}
        />
      )}

      {isLoading ? (
        <div className="text-[var(--muted)]">Loading…</div>
      ) : active.length === 0 ? (
        <div className="text-[var(--muted)] py-6">
          No crew yet. Add your first crew member above.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
          {active.map((m) => (
            <RosterRow key={m.id} member={m} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
              {archived.map((m) => (
                <RosterRow key={m.id} member={m} archived />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AddRow(props: {
  onSave: (input: { name: string; role?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-3 mb-4 flex gap-2 items-center">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (required)"
        className="flex-1 px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
      />
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Role (optional)"
        className="flex-1 px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
      />
      <Button
        onClick={() => name.trim() && props.onSave({ name: name.trim(), role: role.trim() })}
      >
        Save
      </Button>
      <Button variant="ghost" onClick={props.onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function RosterRow({ member, archived = false }: { member: CrewMember; archived?: boolean }) {
  const update = useUpdateCrewMember(member.id);
  const { showToast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);

  async function commitName() {
    setEditingName(false);
    if (name.trim() === "" || name === member.name) {
      setName(member.name);
      return;
    }
    try {
      await update.mutateAsync({ name: name.trim() });
      showToast("Crew member updated");
    } catch {
      setName(member.name);
      showToast("Failed to update");
    }
  }
  async function commitRole() {
    setEditingRole(false);
    if (role === member.role) return;
    try {
      await update.mutateAsync({ role });
      showToast("Crew member updated");
    } catch {
      setRole(member.role);
    }
  }
  async function toggleArchive() {
    try {
      await update.mutateAsync({ archived: !member.archived });
      showToast(member.archived ? "Restored" : "Archived");
    } catch {
      showToast("Failed");
    }
  }

  return (
    <li className={cn("flex items-center gap-3 px-3 py-2.5", archived && "opacity-70")}>
      <CrewAvatar name={member.name} size="lg" />
      <div className="flex-1 min-w-0">
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setName(member.name);
                setEditingName(false);
              }
            }}
            className="w-full px-1 py-0.5 bg-transparent border border-[var(--line)] rounded-[3px] text-[14px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => !archived && setEditingName(true)}
            className="text-[14px] font-[600] text-left hover:underline"
            disabled={archived}
          >
            {member.name}
          </button>
        )}
        {editingRole ? (
          <input
            autoFocus
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onBlur={commitRole}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRole();
              if (e.key === "Escape") {
                setRole(member.role);
                setEditingRole(false);
              }
            }}
            className="w-full mt-0.5 px-1 py-0.5 bg-transparent border border-[var(--line)] rounded-[3px] text-[12px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => !archived && setEditingRole(true)}
            className="block text-[12px] text-[var(--muted)] hover:underline text-left"
            disabled={archived}
          >
            {member.role || (archived ? "—" : "Add role")}
          </button>
        )}
      </div>
      <Button variant="ghost" onClick={toggleArchive}>
        {archived ? "Restore" : "Archive"}
      </Button>
    </li>
  );
}
```

- [ ] **Step 2: Add the page route**

Create `app/(app)/crew/page.tsx`:

```tsx
import { CrewRosterView } from "@/components/crew/CrewRosterView";

export const metadata = { title: "Crew · SqFt" };

export default function CrewPage() {
  return <CrewRosterView />;
}
```

- [ ] **Step 3: Smoke test**

```
npm run dev
```

Navigate to `/crew` (or click the gear icon on the schedule's filter bar). Verify:
- Roster shows the 4 seeded crew members.
- `+ Add crew member` reveals an inline row; saving creates a new crew row.
- Clicking a name lets you rename inline; blur commits.
- `Archive` button moves a member to the collapsed archived section.
- Restore returns them to the active list.

Stop the dev server.

- [ ] **Step 4: Commit**

```
git add app/(app)/crew/page.tsx components/crew/CrewRosterView.tsx
git commit -m "feat(crew): roster admin page with inline-edit and archive"
```

---

## Phase 7 — Final integration

### Task 19: Lint, typecheck, full test run, e2e smoke

**Files:** none

- [ ] **Step 1: Lint**

```
npm run lint:ci
```

Expected: clean. If it errors, run `npm run lint:fix` and re-check.

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Full test suite**

```
npm test
```

Expected: all tests pass, including `crewFilters`, `CrewFilterBar`, and `crew-members` API tests.

- [ ] **Step 4: e2e smoke (optional but recommended)**

If Playwright is configured locally, run:

```
npm run test:e2e
```

If any e2e test references `crew` field directly, update it. Most should already pass — multi-crew is additive at the UI level.

- [ ] **Step 5: Manual smoke run**

```
npm run dev
```

Walk the contractor flow:
1. Dashboard shows event rows with avatar dots.
2. Schedule shows filter bar with All + 4 crews + counts.
3. Clicking a crew dims non-matching events.
4. `+ Add Event` shows the toggle grid; multi-select works.
5. Existing event edit preselects the right toggles.
6. Gear icon → `/crew`.
7. Add a new crew member; it appears in the schedule's filter bar and form toggles.
8. Archive a crew member; they disappear from the form/filter bar (but stay on past events with their dot).

Stop the dev server.

- [ ] **Step 6: Commit anything trivial that came up**

If the smoke pass turned up anything (a className typo, a missing `.crew-match` somewhere), commit those fixes individually. Don't roll them into a noisy "address feedback" commit.

### Task 20: Open the PR

**Files:** none

- [ ] **Step 1: Push the branch**

```
git push -u origin <branch-name>
```

- [ ] **Step 2: Open PR**

Title: `feat(crew): multi-crew per event + crew filter bar (Tier 2 #5 + #6)`

Body should call out:
- Roadmap items closed.
- Schema change + migration that drops `Event.crew`.
- New `/crew` page.
- Mention that the gear-icon link is the discovery path.

---

## Self-Review

**Spec coverage:**
- Schema (CrewMember, M:N, archived, no color, no sortOrder) — Task 1, 2.
- Migration with backfill assertion — Task 2.
- Seed updated to roster + multi-crew on one event — Task 3.
- `crewMemberRepo` with list/create/update/delete + validateIds — Task 4.
- `eventRepo` reads `crewMembers`, writes via `crewMemberIds`, uses `set` for full replacement — Task 5.
- Events API zod schema swap (`crew` → `crewMemberIds`) + cross-org validation — Task 6.
- `/api/crew-members` CRUD with 409-on-in-use — Task 7.
- API tests — Task 8.
- `useEvents` shape change + `useCrewMembers` hook — Task 9.
- `CrewAvatar` primitive — Task 10.
- `crewFilters` helper + tests — Task 11.
- `EventFormPanel` extracted then toggle grid — Task 12, 13.
- Calendar chip avatar dots — Task 14.
- `CrewFilterBar` + tests — Task 15.
- Wire filter bar into ScheduleView, dim non-matching, gear icon to /crew — Task 16.
- Dashboard subtitle update — Task 17.
- Roster page (`/crew`) with inline edit + archive — Task 18.
- Lint/typecheck/test/smoke — Task 19.
- PR — Task 20.

**Placeholder scan:** none of the listed red-flag patterns are present (every code step shows the actual code; commands have expected output; no "TBD" or "similar to Task N").

**Type consistency:** `CalEvent.crewMembers` (in `useEvents.ts`), `CrewMemberSummary` (`{ id, name, role }`), `CrewFilter` (`"all" | number`), `EventForCrew` all align. `crewMemberIds` consistently typed `number[]` everywhere it crosses a boundary. `validateCrewMemberIds(orgId, ids)` — same name in repo (Task 4) and route handlers (Task 6).

**Spec gaps:** none found. Roster admin UI matches spec (no color picker, no drag handles, alphabetical, archive primary). Single-select filter matches spec. Avatar uses `var(--ink-2)` consistently.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-multi-crew.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
