# Crew-as-Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the `CrewMember` table and make `User` the single notion of "a person," so events are assigned to login accounts and a future "My Schedule" page can show the signed-in user's own jobs.

**Architecture:** A structural Prisma migration adds `title` + `archived` to `User`, repoints the event many-to-many from `CrewMember` to `User` (renamed `Event.assignees`), and drops `CrewMember`. There is **no data migration** — all current data is demo data, recreated by the reseed. Application code moves all user DB access into a new `userRepo`, the schedule's crew picker is sourced from active users, and the admin Members page absorbs the retired `/crew` roster (job title + archive/restore).

**Tech Stack:** Next.js (app router), Prisma/Postgres, NextAuth (credentials), react-query, Zod, Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-06-07-crew-as-users-design.md`

---

## Important sequencing note

This is a relation **rename** (`Event.crewMembers: CrewMember[]` → `Event.assignees: User[]`) plus a table drop. Renames have an unavoidable "breaking window": once Task 1 changes the schema, the project will **not** fully `typecheck` until every call site **and the seed** are updated (through Task 11). That is expected.

- Per-task, run the **scoped** check noted in the task (a specific unit test against only its own files, or `prisma validate`). Scoped `vitest run <file>` only compiles what that test imports, so it passes even while the wider tree is mid-rename.
- Run the **full gate** (`lint:ci` + `typecheck` + `test` + `seed:dev` + `build`) once, at the end — **Task 12** — where the tree is internally consistent again. There is no earlier all-green point, because the seed and the events tests (updated in Tasks 9–11) are themselves part of what must compile.
- Commit every task anyway — frequent commits are still the rule; we just don't claim "all green" mid-rename.

A fresh worktree may have incomplete `node_modules`. Before starting, run `npm install` so `@prisma/client`/`pg` exist (DB-gated tests and `prisma generate` need them).

---

## File map

**Created:**
- `prisma/migrations/20260607000000_crew_as_users/migration.sql` — structural migration
- `lib/repositories/userRepo.ts` — org-scoped user data access
- `app/api/users/assignable/route.ts` — lead-accessible active-users list
- `__tests__/repositories/userRepo.test.ts` — DB-gated repo tests
- `__tests__/api/users-assignable.test.ts` — route test

**Modified:**
- `prisma/schema.prisma` — User/Organization/Event changes; delete CrewMember
- `lib/api/errors.ts` — remove `CrewMemberInUseError`
- `lib/repositories/index.ts` — swap `crewMemberRepo` export for `userRepo`
- `lib/repositories/eventRepo.ts` — `assignees`/`assigneeIds`
- `lib/events/schema.ts` — `assigneeIds: string[]`
- `app/api/events/route.ts`, `app/api/events/[id]/route.ts` — `assigneeIds` + `validateUserIds`
- `app/api/users/route.ts`, `app/api/users/[id]/route.ts` — onto `userRepo`; PATCH adds title/archived
- `lib/hooks/useEvents.ts` — `assignees`/`assigneeIds` (string ids)
- `lib/hooks/useMembers.ts` — generalize update mutation
- `components/schedule/crewFilters.ts`, `CrewFilterBar.tsx`, `CalendarGrid.tsx`, `EventFormPanel.tsx` — string ids, `assignees`, source from active users
- `components/dashboard/ScheduleCard.tsx` — `assignees`
- `components/settings/members/*` — title + archive/restore, Active/Archived sections
- `prisma/seed.ts` — installers become crew `User`s; events connect to them
- `CONTEXT.md`, `AGENTS.md` — error code + module/route updates

**Deleted:**
- `app/(app)/crew/page.tsx`, `components/crew/CrewRosterView.tsx`
- `lib/repositories/crewMemberRepo.ts`, `lib/hooks/useCrewMembers.ts`
- `app/api/crew-members/route.ts`, `app/api/crew-members/[id]/route.ts`, `lib/crewMembers/` (schema)
- `__tests__/api/crew-members.test.ts`, `tests/e2e/crew.spec.ts`
- `lib/hooks/useAssignableUsers.ts` is **created** (not deleted) — see Task 5

---

## Task 1: Schema change + structural migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260607000000_crew_as_users/migration.sql`

- [ ] **Step 1: Edit `User` model** (`prisma/schema.prisma:60-69`)

Replace the `User` model with:

```prisma
model User {
  id        String       @id @default(cuid())
  name      String
  email     String       @unique
  password  String // bcrypt hash
  role      String       @default("crew") // admin | lead | crew
  title     String? // free-text job title, e.g. "Lead Installer" — filled forward
  archived  Boolean      @default(false) // deactivated: can't log in or be newly assigned
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdAt DateTime     @default(now())

  events Event[] // events this user is assigned to (Event.assignees)

  @@index([orgId, archived])
}
```

- [ ] **Step 2: Remove the `crewMembers` line from `Organization`** (`prisma/schema.prisma:56`)

Delete this line:

```prisma
  crewMembers       CrewMember[]
```

- [ ] **Step 3: Rename the Event relation** (`prisma/schema.prisma:359`)

In `model Event`, change:

```prisma
  crewMembers CrewMember[]
```

to:

```prisma
  assignees User[]
```

- [ ] **Step 4: Delete the entire `CrewMember` model** (`prisma/schema.prisma:362-374`)

Remove the whole block:

```prisma
model CrewMember {
  id        Int          @id @default(autoincrement())
  ...
  @@index([orgId, archived])
}
```

- [ ] **Step 5: Write the migration SQL by hand**

We hand-author the migration (matching Prisma's implicit-M2M conventions, exactly as the existing `20260509232113_multi_crew` migration did) and apply it with `prisma migrate deploy`. We do **not** use `prisma migrate dev` — on this project's Neon dev DB it offers a destructive reset (baseline divergence).

Create `prisma/migrations/20260607000000_crew_as_users/migration.sql`:

```sql
-- User: job title + deactivation flag
ALTER TABLE "User" ADD COLUMN "title" TEXT;
ALTER TABLE "User" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- Index for listing active people per org
CREATE INDEX "User_orgId_archived_idx" ON "User"("orgId", "archived");

-- New implicit M2M join: Event.assignees <-> User.events
-- (Event sorts before User, so A = Event.id [INTEGER], B = User.id [TEXT].)
CREATE TABLE "_EventToUser" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventToUser_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_EventToUser_B_index" ON "_EventToUser"("B");
ALTER TABLE "_EventToUser" ADD CONSTRAINT "_EventToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_EventToUser" ADD CONSTRAINT "_EventToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the old crew tables. All current rows are demo data; nothing is migrated.
DROP TABLE "_CrewMemberToEvent";
DROP TABLE "CrewMember";
```

- [ ] **Step 6: Validate schema and generate the client**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Run: `npx prisma generate`
Expected: `Generated Prisma Client ...` with no errors.

- [ ] **Step 7: Apply the migration to the dev DB**

Run: `npm run migrate:dev`
Expected: output lists `20260607000000_crew_as_users` as applied, ending with `All migrations have been successfully applied.`

(If `node_modules` lacks `pg`, run `npm install` first.)

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260607000000_crew_as_users
git commit -m "feat(db): merge CrewMember into User (title, archived, Event.assignees)"
```

> After this commit the app will not typecheck until Task 8. That's expected — keep going.

---

## Task 2: `userRepo` — org-scoped user data access (TDD)

Today user DB access is inlined in route handlers, violating the "all Prisma access in `lib/repositories`" rule. Create a repo and test it against the real DB (DB-gated, like `locationRepo.test.ts`).

**Files:**
- Create: `lib/repositories/userRepo.ts`
- Create: `__tests__/repositories/userRepo.test.ts`
- Modify: `lib/repositories/index.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/userRepo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createUser,
  listAssignableUsers,
  listUsers,
  setArchived,
  updateProfile,
  validateUserIds,
} from "@/lib/repositories/userRepo";

// Integration test against the real DB. Skipped in CI's DB-less unit job.
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("userRepo", () => {
  let orgId: string;
  let otherOrgId: string;
  let adminId: string;
  let crewId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "U Co", slug: `u-${Date.now()}` },
    });
    orgId = org.id;
    const other = await prisma.organization.create({
      data: { name: "U2 Co", slug: `u2-${Date.now()}` },
    });
    otherOrgId = other.id;
    const hash = await bcrypt.hash("password123", 10);
    const admin = await createUser(orgId, {
      name: "Ada",
      email: `ada-${Date.now()}@x.dev`,
      role: "admin",
      password: hash,
    });
    adminId = admin.id;
    const crew = await createUser(orgId, {
      name: "Cody",
      email: `cody-${Date.now()}@x.dev`,
      role: "crew",
      password: hash,
    });
    crewId = crew.id;
  });
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
  });

  it("listAssignableUsers returns active users and excludes archived", async () => {
    await setArchived(crewId, orgId, true);
    const active = await listAssignableUsers(orgId);
    const ids = active.map((u) => u.id);
    expect(ids).toContain(adminId);
    expect(ids).not.toContain(crewId);
    await setArchived(crewId, orgId, false); // restore for later assertions
  });

  it("listUsers includeArchived toggles archived rows", async () => {
    await setArchived(crewId, orgId, true);
    const activeOnly = await listUsers(orgId, { includeArchived: false });
    expect(activeOnly.map((u) => u.id)).not.toContain(crewId);
    const all = await listUsers(orgId, { includeArchived: true });
    expect(all.map((u) => u.id)).toContain(crewId);
    await setArchived(crewId, orgId, false);
  });

  it("validateUserIds is true only when every id is in the org", async () => {
    expect(await validateUserIds(orgId, [adminId, crewId])).toBe(true);
    expect(await validateUserIds(otherOrgId, [adminId])).toBe(false);
    expect(await validateUserIds(orgId, [])).toBe(true);
  });

  it("updateProfile sets name and title", async () => {
    const updated = await updateProfile(crewId, orgId, {
      title: "Lead Installer",
    });
    expect(updated?.title).toBe("Lead Installer");
  });

  it("setArchived refuses to archive the last active admin", async () => {
    await expect(setArchived(adminId, orgId, true)).rejects.toThrow(/admin/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `VITEST_DB_AVAILABLE=1 npx vitest run __tests__/repositories/userRepo.test.ts`
(Windows PowerShell: `$env:VITEST_DB_AVAILABLE=1; npx vitest run __tests__/repositories/userRepo.test.ts`)
Expected: FAIL — `userRepo` module / exports not found.

- [ ] **Step 3: Implement `userRepo`**

Create `lib/repositories/userRepo.ts`:

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { LastAdminError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  archived: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export type AssignableUser = { id: string; name: string; title: string | null };

export function listUsers(
  orgId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<UserRow[]> {
  return prisma.user.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { archived: false }) },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export function listAssignableUsers(orgId: string): Promise<AssignableUser[]> {
  return prisma.user.findMany({
    where: { orgId, archived: false },
    select: { id: true, name: true, title: true },
    orderBy: { name: "asc" },
  });
}

export async function createUser(
  orgId: string,
  data: { name: string; email: string; role: string; password: string }
): Promise<UserRow> {
  return prisma.user.create({
    data: {
      orgId,
      name: data.name,
      email: data.email,
      role: data.role,
      password: data.password,
    },
    select: USER_SELECT,
  });
}

export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

export function findUserRow(
  id: string,
  orgId: string
): Promise<UserRow | null> {
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function updateRole(
  id: string,
  orgId: string,
  role: string
): Promise<UserRow | null> {
  const target = await prisma.user.findFirst({
    where: { id, orgId },
    select: { role: true },
  });
  if (!target) return null;
  // Preserve the original route's guard: don't demote the last active admin.
  if (target.role === "admin" && role !== "admin") {
    const activeAdmins = await prisma.user.count({
      where: { orgId, role: "admin", archived: false },
    });
    if (activeAdmins <= 1) throw new LastAdminError();
  }
  await prisma.user.update({ where: { id }, data: { role } });
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function updateProfile(
  id: string,
  orgId: string,
  data: { name?: string; title?: string | null }
): Promise<UserRow | null> {
  const r = await prisma.user.updateMany({ where: { id, orgId }, data });
  if (r.count === 0) return null;
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function setArchived(
  id: string,
  orgId: string,
  archived: boolean
): Promise<UserRow | null> {
  if (archived) {
    const target = await prisma.user.findFirst({
      where: { id, orgId },
      select: { role: true },
    });
    if (target?.role === "admin") {
      const activeAdmins = await prisma.user.count({
        where: { orgId, role: "admin", archived: false },
      });
      if (activeAdmins <= 1) {
        throw new LastAdminError("Can't archive the last active admin.");
      }
    }
  }
  const r = await prisma.user.updateMany({
    where: { id, orgId },
    data: { archived },
  });
  if (r.count === 0) return null;
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function validateUserIds(
  orgId: string,
  ids: string[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.user.count({ where: { id: { in: ids }, orgId } });
  return count === ids.length;
}
```

- [ ] **Step 4: Swap the repo barrel export**

In `lib/repositories/index.ts`, replace line 1:

```ts
export * from "./crewMemberRepo";
```

with:

```ts
export * from "./userRepo";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `$env:VITEST_DB_AVAILABLE=1; npx vitest run __tests__/repositories/userRepo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/userRepo.ts __tests__/repositories/userRepo.test.ts lib/repositories/index.ts
git commit -m "feat(repo): add userRepo (assignable list, archive guard, validateUserIds)"
```

---

## Task 3: Refactor `/api/users` onto `userRepo`; remove `CrewMemberInUseError`

**Files:**
- Modify: `app/api/users/route.ts`
- Modify: `app/api/users/[id]/route.ts`
- Modify: `lib/api/errors.ts`

- [ ] **Step 1: Rewrite `app/api/users/route.ts`**

```ts
import bcrypt from "bcryptjs";
import { z } from "zod";
import { EmailTakenError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { createUser, findByEmail, listUsers } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) =>
  listUsers(orgId, { includeArchived: true })
);

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().toLowerCase().max(254),
    role: z.enum(["admin", "lead", "crew"]),
    password: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { minRole: "admin", input: CreateBody, status: 201 },
  async ({ orgId, input }) => {
    if (await findByEmail(input.email)) throw new EmailTakenError();
    const password = await bcrypt.hash(input.password, 10);
    return createUser(orgId, {
      name: input.name,
      email: input.email,
      role: input.role,
      password,
    });
  }
);
```

- [ ] **Step 2: Rewrite `app/api/users/[id]/route.ts`** to support role / title / archive

```ts
import { z } from "zod";
import { CannotDemoteSelfError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  findUserRow,
  setArchived,
  updateProfile,
  updateRole,
} from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

const PatchBody = z
  .object({
    role: z.enum(["admin", "lead", "crew"]).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().max(100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const PATCH = apiRoute(
  { minRole: "admin", input: PatchBody },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const targetId = (params as { id: string }).id;

    if (input.role !== undefined) {
      if (targetId === session.user.id && input.role !== "admin") {
        throw new CannotDemoteSelfError();
      }
      // updateRole throws LastAdminError if this would demote the last admin.
      if (!(await updateRole(targetId, orgId, input.role))) {
        throw new NotFoundError();
      }
    }

    if (input.name !== undefined || input.title !== undefined) {
      const ok = await updateProfile(targetId, orgId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      if (!ok) throw new NotFoundError();
    }

    if (input.archived !== undefined) {
      if (targetId === session.user.id && input.archived) {
        throw new CannotDemoteSelfError("You can't archive yourself.");
      }
      // setArchived throws LastAdminError if this would archive the last admin.
      if (!(await setArchived(targetId, orgId, input.archived))) {
        throw new NotFoundError();
      }
    }

    const row = await findUserRow(targetId, orgId);
    if (!row) throw new NotFoundError();
    return row;
  }
);
```

> Guards live in `userRepo`: `updateRole` blocks demoting the last active admin (preserving the original route behavior), `setArchived` blocks archiving the last active admin, and the route blocks self-demotion / self-archive. `LastAdminError` is still exported from `lib/api/errors.ts` (only `CrewMemberInUseError` is removed).

- [ ] **Step 3: Remove `CrewMemberInUseError`** from `lib/api/errors.ts`

Delete this block (`lib/api/errors.ts:96-100`):

```ts
export class CrewMemberInUseError extends ConflictError {
  constructor(message: string) {
    super(message, "CREW_MEMBER_IN_USE");
  }
}
```

- [ ] **Step 4: Scoped check — confirm errors module still compiles in isolation**

Run: `npx tsc --noEmit lib/api/errors.ts` *(may surface unrelated path errors; the goal is no reference to the deleted class within errors.ts)*. Primary verification is the Task 9 checkpoint.

- [ ] **Step 5: Commit**

```bash
git add app/api/users lib/api/errors.ts
git commit -m "refactor(api): users routes onto userRepo; drop CrewMemberInUseError"
```

---

## Task 4: Events — repo, schema, routes use `assignees`/`assigneeIds`

**Files:**
- Modify: `lib/repositories/eventRepo.ts`
- Modify: `lib/events/schema.ts`
- Modify: `app/api/events/route.ts`
- Modify: `app/api/events/[id]/route.ts`

- [ ] **Step 1: Rewrite `lib/repositories/eventRepo.ts`**

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type EventWithRelations = Prisma.EventGetPayload<{
  include: {
    customer: { select: { id: true; name: true } };
    assignees: { select: { id: true; name: true; title: true } };
  };
}>;

const includeRelations = {
  customer: { select: { id: true, name: true } },
  assignees: {
    select: { id: true, name: true, title: true },
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

function assertJobHasEstimate(
  type: string | undefined,
  estimateId: number | null | undefined
) {
  if (type === "job" && (estimateId === null || estimateId === undefined)) {
    throw new ValidationError("Job events require a estimateId");
  }
}

export type EventCreateInput = Omit<
  Prisma.EventUncheckedCreateInput,
  "orgId" | "assignees"
> & {
  assigneeIds?: string[];
};

export type EventUpdateInput = Prisma.EventUncheckedUpdateInput & {
  assigneeIds?: string[];
};

export async function createEvent(orgId: string, data: EventCreateInput) {
  assertJobHasEstimate(data.type, data.estimateId ?? null);
  const { assigneeIds, ...rest } = data;
  return prisma.event.create({
    data: {
      ...rest,
      orgId,
      ...(assigneeIds && assigneeIds.length > 0
        ? { assignees: { connect: assigneeIds.map((id) => ({ id })) } }
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
    select: { type: true, estimateId: true },
  });
  if (!current) return null;

  const nextType = typeof data.type === "string" ? data.type : current.type;
  const nextEstimateId =
    data.estimateId === undefined
      ? current.estimateId
      : (data.estimateId as number | null);
  assertJobHasEstimate(nextType, nextEstimateId);

  const { assigneeIds, ...rest } = data;

  return prisma.event.update({
    where: { id },
    data: {
      ...rest,
      ...(assigneeIds !== undefined
        ? { assignees: { set: assigneeIds.map((uid) => ({ id: uid })) } }
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

- [ ] **Step 2: Update `lib/events/schema.ts`** — change `crewMemberIds` (both schemas) from int array to string array:

In `eventCreateSchema` replace line 15:

```ts
  crewMemberIds: z.array(z.number().int().positive()).max(20).optional(),
```

with:

```ts
  assigneeIds: z.array(z.string().min(1)).max(20).optional(),
```

In `eventUpdateSchema` replace line 28 with the same:

```ts
  assigneeIds: z.array(z.string().min(1)).max(20).optional(),
```

- [ ] **Step 3: Update `app/api/events/route.ts`**

```ts
import { ValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventCreateSchema } from "@/lib/events/schema";
import { createEvent, listEvents, validateUserIds } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId }) => listEvents(orgId));

export const POST = apiRoute(
  { minRole: "lead", input: eventCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const { endDate, assigneeIds, ...rest } = input;

    if (assigneeIds && assigneeIds.length > 0) {
      const ok = await validateUserIds(orgId, assigneeIds);
      if (!ok) throw new ValidationError("Invalid assignee");
    }

    return createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
      ...(assigneeIds ? { assigneeIds } : {}),
    });
  }
);
```

- [ ] **Step 4: Update `app/api/events/[id]/route.ts`**

```ts
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventIdParams, eventUpdateSchema } from "@/lib/events/schema";
import { deleteEvent, updateEvent, validateUserIds } from "@/lib/repositories";

export const PATCH = apiRoute(
  { minRole: "lead", input: eventUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = eventIdParams.parse(params);
    const { date, endDate, assigneeIds, ...rest } = input;

    if (assigneeIds && assigneeIds.length > 0) {
      const ok = await validateUserIds(orgId, assigneeIds);
      if (!ok) throw new ValidationError("Invalid assignee");
    }

    const data = {
      ...rest,
      ...(date ? { date: new Date(date) } : {}),
      ...(endDate !== undefined
        ? { endDate: endDate ? new Date(endDate) : null }
        : {}),
      ...(assigneeIds !== undefined ? { assigneeIds } : {}),
    };

    const event = await updateEvent(id, orgId, data);
    if (!event) throw new NotFoundError();
    return event;
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = eventIdParams.parse(params);
    await deleteEvent(id, orgId);
    return null;
  }
);
```

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/eventRepo.ts lib/events/schema.ts app/api/events
git commit -m "refactor(events): assign Users via assignees/assigneeIds"
```

---

## Task 5: Hooks — `useEvents`, new `useAssignableUsers`; auth blocks archived

**Files:**
- Modify: `lib/hooks/useEvents.ts`
- Create: `lib/hooks/useAssignableUsers.ts`
- Create: `app/api/users/assignable/route.ts`
- Modify: `lib/auth.ts`

- [ ] **Step 1: Update `lib/hooks/useEvents.ts`** — rename the summary type and event fields

Replace the `CrewMemberSummary` interface and the `crewMembers`/`crewMemberIds` fields:

```ts
export interface AssigneeSummary {
  id: string;
  name: string;
  title?: string | null;
}
```

In `CalEvent`, replace `crewMembers: CrewMemberSummary[];` with:

```ts
  assignees: AssigneeSummary[];
```

In `CreateEventInput`, replace `crewMemberIds?: number[];` with:

```ts
  assigneeIds?: string[];
```

- [ ] **Step 2: Create the assignable-users endpoint** `app/api/users/assignable/route.ts`

```ts
import { apiRoute } from "@/lib/api/route";
import { listAssignableUsers } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  listAssignableUsers(orgId)
);
```

- [ ] **Step 3: Create `lib/hooks/useAssignableUsers.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

export interface AssignableUser {
  id: string;
  name: string;
  title: string | null;
}

async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const res = await fetch("/api/users/assignable");
  if (!res.ok) throw new Error("Failed to fetch assignable users");
  return res.json();
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: ["users", "assignable"],
    queryFn: fetchAssignableUsers,
  });
}
```

- [ ] **Step 4: Block archived users from logging in** — in `lib/auth.ts`, in `authorize`, after the `if (!user) return null;` line (`lib/auth.ts:55`), add:

```ts
        if (user.archived) return null;
```

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useEvents.ts lib/hooks/useAssignableUsers.ts app/api/users/assignable lib/auth.ts
git commit -m "feat(hooks): useAssignableUsers; events use assignees; block archived login"
```

---

## Task 6: Schedule UI — string ids, `assignees`, source from active users

**Files:**
- Modify: `components/schedule/crewFilters.ts`
- Modify: `components/schedule/CrewFilterBar.tsx`
- Modify: `components/schedule/CalendarGrid.tsx`
- Modify: `components/schedule/EventFormPanel.tsx`
- Modify: `components/dashboard/ScheduleCard.tsx`
- Modify: `__tests__/components/schedule/crewFilters.test.ts`

- [ ] **Step 1: Update the failing filter test first** (`__tests__/components/schedule/crewFilters.test.ts`)

Replace the file with string ids and `assignees`:

```ts
import { describe, expect, it } from "vitest";
import {
  type EventForCrew,
  eventMatchesCrew,
  weekCrewCounts,
} from "@/components/schedule/crewFilters";

const events: EventForCrew[] = [
  { id: 1, date: "2026-05-04", assignees: [{ id: "u10", name: "Carlos" }] },
  {
    id: 2,
    date: "2026-05-05",
    assignees: [
      { id: "u10", name: "Carlos" },
      { id: "u11", name: "Dave" },
    ],
  },
  { id: 3, date: "2026-05-05", assignees: [] },
  { id: 4, date: "2026-05-12", assignees: [{ id: "u10", name: "Carlos" }] },
];

describe("eventMatchesCrew", () => {
  it("'all' matches every event", () => {
    expect(events.every((e) => eventMatchesCrew(e, "all"))).toBe(true);
  });
  it("an id filter matches when the assignee is on the event", () => {
    expect(eventMatchesCrew(events[0], "u10")).toBe(true);
    expect(eventMatchesCrew(events[1], "u11")).toBe(true);
  });
  it("does not match when the assignee is not on the event", () => {
    expect(eventMatchesCrew(events[0], "u11")).toBe(false);
  });
  it("never matches an event with no assignees when a specific filter is active", () => {
    expect(eventMatchesCrew(events[2], "u10")).toBe(false);
  });
});

describe("weekCrewCounts", () => {
  const weekStart = "2026-05-04";
  it("counts events per assignee within the visible week", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get("u10")).toBe(2);
    expect(counts.get("u11")).toBe(1);
  });
  it("returns total across all events in the week as the 'all' bucket", () => {
    const counts = weekCrewCounts(events, weekStart, 7);
    expect(counts.get("all")).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/components/schedule/crewFilters.test.ts`
Expected: FAIL — type/shape mismatch (`assignees` not on `EventForCrew`).

- [ ] **Step 3: Rewrite `components/schedule/crewFilters.ts`**

```ts
export type CrewFilter = "all" | string;

export type EventForCrew = {
  id: number;
  date: string;
  assignees: { id: string; name: string }[];
};

export function eventMatchesCrew(
  event: EventForCrew,
  filter: CrewFilter
): boolean {
  if (filter === "all") return true;
  return event.assignees.some((m) => m.id === filter);
}

/**
 * Count events per assignee within a [weekStart, weekStart+days) window.
 * Returns counts keyed by user id, plus an "all" key for the window total.
 */
export function weekCrewCounts(
  events: EventForCrew[],
  weekStart: string,
  days: number
): Map<string | "all", number> {
  const startMs = Date.parse(`${weekStart}T00:00:00`);
  const endMs = startMs + days * 86_400_000;
  const counts = new Map<string | "all", number>();

  for (const ev of events) {
    const ms = Date.parse(`${ev.date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(ms) || ms < startMs || ms >= endMs) continue;

    counts.set("all", (counts.get("all") ?? 0) + 1);
    for (const m of ev.assignees) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
  }
  return counts;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run __tests__/components/schedule/crewFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `components/schedule/CrewFilterBar.tsx`**

- Change the `crew` prop type to `{ id: string; name: string }[]`.
- The `EventForCrew` import already carries `assignees`; no other prop change.
- Remove the `<Link href="/crew">` settings gear (lines 119-126) and the now-unused `Link` import (line 3) — `/crew` no longer exists. (People are managed in Settings → Members, which leads can't reach, so no link belongs on this bar.)

The `counts`, `active`, and `onChange` logic already works with string ids since `CrewFilter` is now `"all" | string`.

- [ ] **Step 6: Update `components/schedule/CalendarGrid.tsx`**

- Replace the import `import { useCrewMembers } from "@/lib/hooks/useCrewMembers";` with `import { useAssignableUsers } from "@/lib/hooks/useAssignableUsers";`.
- Replace `const { data: crew = [] } = useCrewMembers();` with `const { data: crew = [] } = useAssignableUsers();`.
- The `<CrewFilterBar crew={crew.map((m) => ({ id: m.id, name: m.name, role: m.role }))} .../>` call: change to `crew={crew.map((m) => ({ id: m.id, name: m.name }))}`.
- Every `ev.crewMembers` reference in the event chip (lines ~408-426) becomes `ev.assignees`.
- The `crewFilter` state is typed `CrewFilter` already; no change.

- [ ] **Step 7: Update `components/schedule/EventFormPanel.tsx`**

- Replace `import { useCrewMembers } from "@/lib/hooks/useCrewMembers";` with `import { useAssignableUsers } from "@/lib/hooks/useAssignableUsers";`.
- `const { data: crew = [], isLoading: crewLoading } = useAssignableUsers();`.
- `const [crewMemberIds, setCrewMemberIds] = useState<Set<number>>(new Set());` → `useState<Set<string>>(new Set())`.
- In the `useEffect`, `setCrewMemberIds(new Set((ev.crewMembers ?? []).map((m) => m.id)));` → `...(ev.assignees ?? []).map((m) => m.id)`.
- In `handleSave`, `crewMemberIds: Array.from(crewMemberIds),` → `assigneeIds: Array.from(crewMemberIds),`.
- The empty state (lines 310-316): replace the `<Link href="/crew">Add crew members →</Link>` with plain text, since leads can't manage members:

```tsx
          ) : crew.length === 0 ? (
            <div className="text-[12px] text-[var(--muted)]">
              No people to assign yet.
            </div>
```

- Remove the now-unused `Link` import (line 3) if nothing else uses it. (Verify: after the edit above, `Link` is unused → remove it.)

- [ ] **Step 8: Update `components/dashboard/ScheduleCard.tsx`** — every `ev.crewMembers` becomes `ev.assignees` (the `.length > 0` guard and the `.slice(0, 3).map(...)` avatar block, lines 117-125).

- [ ] **Step 9: Commit**

```bash
git add components/schedule components/dashboard/ScheduleCard.tsx __tests__/components/schedule/crewFilters.test.ts
git commit -m "refactor(schedule): assignees + string ids, picker from active users"
```

---

## Task 7: Members page — title + Archive/Restore + Active/Archived sections

**Files:**
- Modify: `components/settings/members/types.ts`
- Modify: `lib/hooks/useMembers.ts`
- Modify: `app/(app)/settings/members/page.tsx`
- Modify: `components/settings/members/MembersView.tsx`
- Modify: `components/settings/members/MemberRow.tsx`

- [ ] **Step 1: Extend `MemberRow` type** (`components/settings/members/types.ts`)

```ts
export type MemberRole = "admin" | "lead" | "crew";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  title: string | null;
  archived: boolean;
  createdAt: string;
};

export type CreateMemberInput = {
  name: string;
  email: string;
  role: MemberRole;
  password: string;
};

export type UpdateMemberInput = {
  id: string;
  role?: MemberRole;
  title?: string | null;
  archived?: boolean;
};
```

- [ ] **Step 2: Generalize the update hook** (`lib/hooks/useMembers.ts`)

Replace `useUpdateMemberRole` with a general `useUpdateMember` (keep `useCreateMember` as-is):

```ts
export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpdateMemberInput) => {
      const { id, ...patch } = args;
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await readApiError(res, "Failed to update member");
      }
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}
```

Update the import line to pull `UpdateMemberInput` from `./types` (add it to the existing `import type` list) and remove the now-unused `MemberRole` import if nothing references it.

- [ ] **Step 3: Update the server page** (`app/(app)/settings/members/page.tsx`) to select + map the new fields:

In the `prisma.user.findMany` select, add `title: true, archived: true`. In the `.map`, add:

```ts
    title: u.title,
    archived: u.archived,
```

- [ ] **Step 4: Split MembersView into Active / Archived** (`components/settings/members/MembersView.tsx`)

```tsx
"use client";

import { useState } from "react";
import { AddMemberForm } from "./AddMemberForm";
import { MemberRow } from "./MemberRow";
import type { MemberRow as Row } from "./types";

export function MembersView({
  initial,
  currentUserId,
}: {
  initial: Row[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);

  function upsert(next: Row) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === next.id);
      if (idx === -1) return [...prev, next];
      const out = prev.slice();
      out[idx] = next;
      return out;
    });
  }

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">Members</h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Who can see and do what. Anyone here can be assigned to jobs.
      </p>

      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] mb-4">
        {active.map((row) => (
          <MemberRow
            key={row.id}
            row={row}
            isSelf={row.id === currentUserId}
            onUpdated={upsert}
          />
        ))}
      </div>

      <AddMemberForm onCreated={upsert} />

      {archived.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[12px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-2">
            Archived ({archived.length})
          </h2>
          <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] opacity-80">
            {archived.map((row) => (
              <MemberRow
                key={row.id}
                row={row}
                isSelf={row.id === currentUserId}
                onUpdated={upsert}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rewrite MemberRow** (`components/settings/members/MemberRow.tsx`) to add title display + Archive/Restore. Replace the file:

```tsx
"use client";

import { useState } from "react";
import { useUpdateMember } from "@/lib/hooks/useMembers";
import type { MemberRole, MemberRow as Row } from "./types";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function MemberRow({
  row,
  isSelf,
  onUpdated,
}: {
  row: Row;
  isSelf: boolean;
  onUpdated: (next: Row) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateMember();

  function patch(input: Parameters<typeof mutation.mutate>[0]) {
    setError(null);
    mutation.mutate(input, {
      onSuccess: (updated) => onUpdated(updated),
      onError: (err: unknown) => {
        const msg =
          typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to update member";
        setError(msg);
      },
    });
  }

  const initials =
    row.name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("") ||
    row.email[0]?.toUpperCase() ||
    "·";

  return (
    <div className="grid grid-cols-[1fr_1.5fr_140px_90px] items-center gap-3 px-4 py-3 border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[11px] font-[var(--font-mono)] font-[600] text-[var(--ink)]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-[500] truncate">{row.name}</div>
          <input
            defaultValue={row.title ?? ""}
            placeholder="Add title"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== (row.title ?? "")) {
                patch({ id: row.id, title: next || null });
              }
            }}
            className="mt-0.5 w-full text-[12px] text-[var(--muted)] bg-transparent border border-transparent hover:border-[var(--line)] focus:border-[var(--line)] rounded-[3px] px-1 py-0.5"
            aria-label={`Title for ${row.name}`}
          />
        </div>
      </div>
      <div className="text-[12px] text-[var(--muted)] truncate">{row.email}</div>
      <div>
        <select
          value={row.role}
          onChange={(e) => patch({ id: row.id, role: e.target.value as MemberRole })}
          disabled={isSelf || row.archived || mutation.isPending}
          className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] px-2 py-1.5 rounded-[5px] disabled:opacity-60"
          aria-label={`Role for ${row.name}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {error && (
          <div className="text-[11px] text-[var(--accent)] mt-1">{error}</div>
        )}
      </div>
      <div className="text-right">
        {!isSelf && (
          <button
            type="button"
            onClick={() => patch({ id: row.id, archived: !row.archived })}
            disabled={mutation.isPending}
            className="text-[11px] font-[var(--font-mono)] uppercase tracking-[.04em] px-2 py-1 border border-[var(--line)] rounded-[5px] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {row.archived ? "Restore" : "Archive"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `AddMemberForm` callback shape** — `useCreateMember` returns the new `MemberRow`, which now includes `title`/`archived` from the server. No code change needed in `AddMemberForm.tsx` (it forwards the returned row to `onCreated`). Verify it still compiles against the new `MemberRow` type at the checkpoint.

- [ ] **Step 7: Commit**

```bash
git add components/settings/members lib/hooks/useMembers.ts app/\(app\)/settings/members/page.tsx
git commit -m "feat(members): job title + archive/restore, active/archived sections"
```

---

## Task 8: Remove all CrewMember code + the `/crew` page

**Files (delete):**
- `app/(app)/crew/page.tsx`
- `components/crew/CrewRosterView.tsx`
- `lib/repositories/crewMemberRepo.ts`
- `lib/hooks/useCrewMembers.ts`
- `app/api/crew-members/route.ts`, `app/api/crew-members/[id]/route.ts`
- `lib/crewMembers/` (the `schema.ts` there)
- `__tests__/api/crew-members.test.ts`
- `tests/e2e/crew.spec.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm app/\(app\)/crew/page.tsx components/crew/CrewRosterView.tsx \
  lib/repositories/crewMemberRepo.ts lib/hooks/useCrewMembers.ts \
  app/api/crew-members/route.ts app/api/crew-members/\[id\]/route.ts \
  __tests__/api/crew-members.test.ts tests/e2e/crew.spec.ts
git rm -r lib/crewMembers
```

- [ ] **Step 2: Grep for any stragglers**

Run: `git grep -nE "crewMember|CrewMember|/crew\b|useCrewMembers|crew-members"`
Expected matches **only** in: `prisma/seed.ts` (updated in Task 10), `__tests__/api/events*.test.ts` (updated in Task 9), `docs/` (specs/plans), and old migration SQL under `prisma/migrations/` (history — never edit). There must be **no** matches left in `app/`, `components/`, `lib/`, or any non-events test. Fix any such straggler before continuing.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove CrewMember table code and /crew page"
```

---

## Task 9: Update the events API tests for `assigneeIds`

**Files:**
- Modify: any `__tests__/api/events*.test.ts` referencing `crewMemberIds`/`validateCrewMemberIds`

- [ ] **Step 1: Locate event API tests**

Run: `git grep -nlE "crewMemberIds|validateCrewMemberIds" __tests__`
Expected: a list of event test files (e.g. `__tests__/api/events.test.ts`). If none exist, skip to Task 11.

- [ ] **Step 2: Update each match**

In every matched test: rename mocked `validateCrewMemberIds` → `validateUserIds`, change request bodies from `crewMemberIds: [1, 2]` (numbers) to `assigneeIds: ["u1", "u2"]` (strings), and update the `vi.mock("@/lib/repositories", ...)` factory to export `validateUserIds` instead of `validateCrewMemberIds`. Assert the route forwards `assigneeIds` to `createEvent`/`updateEvent`.

- [ ] **Step 3: Run the updated tests**

Run: `npx vitest run __tests__/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/api
git commit -m "test(events): assigneeIds + validateUserIds"
```

---

## Task 10: Add a route test for `/api/users/assignable`

**Files:**
- Create: `__tests__/api/users-assignable.test.ts`

- [ ] **Step 1: Write the test** (mirrors `crew-members.test.ts` helper style)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listAssignableUsers: vi.fn(),
}));

const stubSession = { user: { id: "u1", orgId: "org1", role: "lead" } };

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  requireSession: vi.fn().mockResolvedValue(stubSession as any),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { listAssignableUsers } = await import("@/lib/repositories");
const { GET } = await import("@/app/api/users/assignable/route");
const mockList = vi.mocked(listAssignableUsers);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/users/assignable", () => {
  it("returns the org's assignable users", async () => {
    mockList.mockResolvedValue([{ id: "u2", name: "Cody", title: null }]);
    const res = await GET(
      makeRequest("GET", "http://x/api/users/assignable"),
      params({})
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("org1");
    expect(await res.json()).toEqual([{ id: "u2", name: "Cody", title: null }]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run __tests__/api/users-assignable.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/api/users-assignable.test.ts
git commit -m "test(api): GET /api/users/assignable"
```

---

## Task 11: Reseed — installers become crew Users; events connect to them

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Remove the `crewMember` cleanup line** (`prisma/seed.ts:~60`)

In the "clear prior demo data" block there is a line:

```ts
    await prisma.crewMember.deleteMany({ where: { orgId: { in: demoOrgIds } } });
```

Delete it. (The surrounding `organization.deleteMany` cascade already removes everything; and the `crewMember` model no longer exists on the client, so leaving this line would crash the seed.)

- [ ] **Step 2: Replace the crew-roster block** (`prisma/seed.ts:100-115`)

Replace the `// ── Crew roster ──` block (the four `prisma.crewMember.create` calls and the `console.log("  ✓ 4 crew members")`) with four crew `User`s. Note the previous job titles move to `title`:

```ts
  // ── Crew (installers as crew-role users) ──────────────────────────────────
  const crewPwd = await bcrypt.hash("demo1234", 10);
  const [crewMike, crewCarlos, crewDave, crewSarah] = await Promise.all([
    prisma.user.create({
      data: {
        orgId: org.id,
        name: "Mike",
        email: "mike@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Owner / Sales",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        name: "Carlos",
        email: "carlos@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Lead Installer",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        name: "Dave",
        email: "dave@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Installer",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        name: "Sarah",
        email: "sarah@sqft.dev",
        password: crewPwd,
        role: "crew",
        title: "Showroom",
      },
    }),
  ]);
  console.log("  ✓ 4 crew users (mike/carlos/dave/sarah @sqft.dev / demo1234)");
```

The downstream `crewMike` / `crewCarlos` / `crewDave` / `crewSarah` variables keep their names, so the event-creation block needs only its relation key changed (next step). Their `.id` is now a string cuid — fine, the connects use `.id`.

- [ ] **Step 3: Repoint event connects** — in the calendar-events block (`prisma/seed.ts:1463-1575`), change every `crewMembers: { connect: [...] }` to `assignees: { connect: [...] }`. There are 8 occurrences (lines 1475, 1489, 1502, 1515, 1529, 1545, 1558, 1572). The connect targets (`{ id: crewCarlos.id }` etc.) stay the same.

Run to find them: `git grep -n "crewMembers" prisma/seed.ts` → replace each with `assignees`.

- [ ] **Step 4: Reseed and verify**

Run: `npm run seed:dev`
Expected: ends with `✅ Seed complete!`, and includes `✓ 4 crew users` and `✓ 8 calendar events`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): installers as crew users; events connect via assignees"
```

---

## Task 12: Docs + final verification gate

This is the first point the whole tree is internally consistent (all code, the seed, and all tests have been updated). Everything below must pass before the work is done.

**Files:**
- Modify: `CONTEXT.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `CONTEXT.md`**

- In the **API Error Codes → Domain codes** list, delete the `CREW_MEMBER_IN_USE` bullet.
- Add a short note (near the schedule/Event discussion, or as a new small "People" line) that assignable people are `User`s of any role (`admin|lead|crew`); `User.archived` deactivates a person (blocks login + new assignment, preserves history); events link them via `Event.assignees`.

- [ ] **Step 2: Update `AGENTS.md`**

- In **Where things live**, remove references to `crewMemberRepo` / the `/crew` route / `/api/crew-members`. Note `lib/repositories/userRepo.ts` and that the admin **Members** page (`/settings/members`) is the single people-management surface.
- If a `crew` route group is listed under `app/(app)/`, remove it.

- [ ] **Step 3: Full gate**

Run, in order, and confirm each is clean:
- `npm run lint:ci` → no errors (`npm run lint:fix` auto-fixes formatting; common misses: an unused `Link`/`MemberRole` import after the edits)
- `npm run typecheck` → no errors (common misses: a lingering `crewMembers` or `number`-typed assignee id)
- `npx vitest run` → all pass (DB-less; skips the repo integration suites by design)
- `$env:VITEST_DB_AVAILABLE=1; npx vitest run` → all pass (with DB, incl. `userRepo`)
- `npm run seed:dev` → completes
- `npm run build` → succeeds

- [ ] **Step 4: E2E smoke (optional but recommended)**

Run: `npm run test:e2e -- --workers=1` (single worker matches CI and avoids known parallel flakiness).
Expected: schedule-related specs pass. If a spec asserted `/crew` or crew-roster behavior, update or remove it (the `crew.spec.ts` was deleted in Task 8; check `tests/e2e/schedule*.spec.ts` for crew assignment steps and update them to assign a `User`).

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md AGENTS.md
git commit -m "docs: crew→user merge (error code, modules, Members surface)"
```

---

## Self-review notes (coverage)

- Spec §1 data model → Task 1.
- Spec §2 structural migration → Task 1 (Step 5).
- Spec §3 removals → Tasks 3, 8; `userRepo` → Task 2; events `assignees` → Task 4; assignable endpoint + hook → Task 5; schedule swaps → Task 6; Members page (title, archive, sections) → Task 7; archived-login block → Task 5 (Step 4).
- Spec §4 seed → Task 11; tests → Tasks 2, 6, 9, 10 (+ deletions in Task 8); docs → Task 12.
- Type consistency: assignee ids are `string` everywhere (`eventRepo` `assigneeIds: string[]`, `schema` `z.string()`, `useEvents` `assigneeIds?: string[]`, `crewFilters` `CrewFilter = "all" | string`, `EventFormPanel` `Set<string>`); summary type is `AssigneeSummary {id:string;name;title?}` in `useEvents` and `{id:string;name:string}` in `crewFilters`/`CrewFilterBar`.
- `validateUserIds` (Task 2) is the only validator referenced by the event routes (Task 4) and is exported via the barrel (Task 2 Step 4).
