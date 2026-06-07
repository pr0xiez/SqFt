# Crew-as-Users — design

**Status:** approved, ready for implementation plan
**Date:** 2026-06-07

## Why

This is the **foundation for a future "My Schedule" page** (its own spec). That
page needs to answer "which jobs is the logged-in person on today?" — but today
the app has two unrelated notions of "person":

- **`User`** — a login account. Has `email`, `password`, and a permission
  `role` (`admin | lead | crew`). This is who can sign in and what they may do.
- **`CrewMember`** — an assignable body on the calendar. Has `name`, a free-text
  job-title `role` ("Lead Installer"), and `archived`. **No login.** Events link
  their crew here.

There is no foreign key between them, so the system literally cannot connect a
signed-in person to the jobs they're assigned to. The split was only ever buying
one thing — the ability to schedule someone who has no login — and we've decided
that's not worth it: **every assignable person should be a `User`.** Merging the
two makes "My Schedule" trivial ("events where I'm an assignee") and removes a
redundant table and page.

## Decisions (locked)

1. **Crew is a `User` with `role = "crew"`.** `CrewMember` is retired.
2. **Everyone who can be scheduled has a login.** No "no-login" person concept.
3. **People are managed in one place** — the existing admin-only Members page
   (`/settings/members`). The separate lead-editable `/crew` roster is removed.
   Consequence accepted: **leads can no longer add crew; that becomes
   admin-only.**
4. **Keep a job title** as `User.title` (optional, free text). **Not** backfilled
   by any migration — created forward by app users. (The seed may author demo
   titles; that is authored data, not a backfill.)
5. **Deactivation, not deletion.** A new `User.archived` flag replaces
   `CrewMember.archived`. People are never hard-deleted (history is preserved).
6. **All active users are assignable** to events, regardless of role — admins and
   leads work jobs too, so the assignee list is not crew-only.
7. **The event relation is renamed `crewMembers` → `assignees`** (`User[]`),
   because assignees aren't only crew. UI labels may still say "Crew" where that
   reads better; the data is `assignees`.
8. **No data migration.** All current data is demo data. The migration is purely
   structural; demo data is recreated by the reseed.

## Section 1 — Data model

`User` gains:

- `title String?` — optional free-text job title. Nullable, filled forward.
- `archived Boolean @default(false)` — deactivation. Archived users can't be
  assigned to new events and can't log in (enforced at the auth seam), but stay
  attached to events they're already on.
- `assignees`-side relation `events Event[]` — the assignment many-to-many,
  inherited from what `CrewMember` had.
- `@@index([orgId, archived])` — fast listing of active people.

`Event`:

- `crewMembers CrewMember[]` → **`assignees User[]`** (the implicit M2M now
  targets `User`).

`CrewMember`:

- **Deleted** (after the structural migration).

**Ripple — assignee id type changes `Int` → `String`.** `User.id` is a cuid
string; `CrewMember.id` was an autoincrement int. So everywhere events touch
crew, ids become strings:

- `CalEvent.crewMembers` → `CalEvent.assignees`, each `id: string`
- event form selection `crewMemberIds: number[]` → `assigneeIds: string[]`
- schedule crew-filter keys (`crewFilters.ts`) key on string ids

## Section 2 — Migration (structural only)

Forward-only, no squash (Vercel runs `prisma migrate deploy`). Because all data
is demo data, there is **no backfill and no placeholder accounts** — the table is
simply dropped and the demo is reseeded.

1. **Additive (safe on a populated DB):**
   - `ALTER TABLE "User" ADD COLUMN "title" TEXT;` (nullable)
   - `ALTER TABLE "User" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;`
     (has a default → no `23502` on existing rows)
   - create index on `User(orgId, archived)`
   - create the new `Event ↔ User` implicit join table (`_EventToUser`)
2. **Teardown:**
   - `DROP TABLE "_CrewMemberToEvent";` (old implicit join)
   - `DROP TABLE "CrewMember";`

No `User` rows are created by the migration; the reseed (Section 4) recreates the
demo crew as users.

## Section 3 — Application layer

### Remove (CrewMember-specific)

- `app/(app)/crew/page.tsx` and `components/crew/CrewRosterView.tsx`
- `lib/repositories/crewMemberRepo.ts`
- `app/api/crew-members/route.ts` and `app/api/crew-members/[id]/route.ts`
- `lib/hooks/useCrewMembers.ts`
- the `CREW_MEMBER_IN_USE` error code and `CrewMemberInUseError`
  (we archive, never hard-delete people)
- update `lib/repositories/index.ts` exports

### Add `lib/repositories/userRepo.ts`

Today user access is inlined in the `/api/users` route handlers, which violates
the "all Prisma access lives in `lib/repositories`" rule. Consolidate into an
org-scoped repo and refactor the existing routes onto it:

- `listUsers(orgId, { includeArchived })`
- `listAssignableUsers(orgId)` — active users only, `{ id, name, title }`
- `createUser(orgId, { name, email, role, password })`
- `updateRole(id, orgId, role)` (keeps existing last-admin / self-demote guards)
- `updateProfile(id, orgId, { name?, title? })`
- `setArchived(id, orgId, archived)` — guards: cannot archive self, cannot
  archive the last active admin
- `validateUserIds(orgId, ids)` — replaces `validateCrewMemberIds`; ensures all
  ids belong to the org

### Events

- `eventRepo`: `crewMemberIds: number[]` → `assigneeIds: string[]`;
  `connect`/`set` `User`s; include `assignees` (select `id, name, title, role`);
  validate via `validateUserIds`.
- `/api/events` Zod body and `useEvents`: `crewMembers`/`crewMemberIds` →
  `assignees`/`assigneeIds` (string ids).

### Assignable-people endpoint

`/api/users` GET is admin-only, but lead+ create events and need the picker. Add
`GET /api/users/assignable` (minRole `lead`) returning active users
`{ id, name, title }`. New hook `useAssignableUsers()` replaces
`useCrewMembers()` in the schedule.

### Schedule UI swaps

CrewMember → User, number → string ids, list sourced from `useAssignableUsers`:
`EventFormPanel`, `CrewFilterBar`, `CalendarGrid`, `crewFilters.ts`,
`ScheduleCard`.

### Members page (`/settings/members`, stays admin-only) — additions

- show + edit `title` per row
- **Archive / Restore** per row (guards above)
- split the list into Active / Archived sections

### Behavior

- Archived users drop out of the assignable list but still render on events they
  are already on.
- The auth seam (`lib/auth.ts` `authorize`) rejects login for `archived` users.
- A `crew` user still sees only the Schedule tab (unchanged).

### Deliberately out of scope (YAGNI)

Admin reset-password / edit-email. Creation already sets credentials; password
recovery is a pre-existing gap, not introduced by this change.

## Section 4 — Seed, tests, docs

### Seed (`prisma/seed.ts`)

Keep the demo identical, just as users:

- The four installers (Mike, Carlos, Dave, Sarah) become `User`s with
  `role = "crew"`, demo credentials (e.g. `mike@sqft.dev` … / `demo1234`), and
  `title` carried over from the old `CrewMember.role` ("Owner / Sales",
  "Lead Installer", "Installer", "Showroom").
- Event seeds `connect` to the installer `User` ids instead of `CrewMember` ids.
- Remove all `prisma.crewMember.*` calls.
- Keep `lead@` / `admin@` for role testing. (The installers now provide
  crew-role logins, useful for exercising the future My Schedule page.)

### Tests

- delete `__tests__/api/crew-members.test.ts` and `tests/e2e/crew.spec.ts`
- update `__tests__/components/schedule/crewFilters.test.ts` for string ids and
  `assignees`
- add `userRepo` tests: `listAssignableUsers` excludes archived,
  `validateUserIds` org-scoping, `setArchived` guards (self, last admin)
- update event repo/API tests referencing `crewMemberIds`
- update the schedule e2e to assign a `User`

### Docs (same change, per the in-repo rule)

- `CONTEXT.md` — remove `CREW_MEMBER_IN_USE` from the error-code list; add a
  short note that assignable people are `User`s (crew/lead/admin) and that
  `archived` deactivates.
- `AGENTS.md` — drop `crewMemberRepo` / `/crew` / `/api/crew-members`; note
  `userRepo` and that the Members page is the single people-management surface.

## Verification

- `npm run lint:ci`, `npm run typecheck`, `npm test` all pass.
- `npm run seed:dev` produces the same demo schedule, now backed by users.
- Manual: sign in as a crew installer; confirm the schedule renders their
  assignments. Archive a user in Members; confirm they vanish from the assignee
  picker but remain on existing events.

## Follow-up (separate spec)

**My Schedule** — mobile-first day view defaulting to the device's today, with
forward/back day navigation, showing the signed-in user's own assignments. Built
directly on `Event.assignees` once this spec lands.
