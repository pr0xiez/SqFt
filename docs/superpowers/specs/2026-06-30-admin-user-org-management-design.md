# Super-admin user & org management

**Date:** 2026-06-30
**Status:** Approved — ready for implementation planning

## Problem

SqFt already has a super-admin `(admin)` area gated by the `SUPER_ADMIN_EMAILS`
allowlist. Today it contains exactly one page — `/admin/orgs` — which lists every
organization and can *create* a new org (minting its first admin user). What's
missing:

- **No way to add users to an existing org** from the admin area. The in-app
  `/settings/members` page manages only the *caller's own* org, so a SqFt
  operator can't add a second admin, a lead, or a crew member to a tenant they're
  supporting.
- **No `/admin` landing page** — you have to know to type `/admin/orgs`.
- **Nothing in the navigation points to `/admin`.**

## Goal

Building on the existing super-admin plumbing, add:

1. **Per-org member management** — a detail page at `/admin/orgs/[orgId]` with
   full member management: add a user, change a role, archive/restore.
2. **A minimal `/admin` dashboard** — a landing page with a couple of counts and
   a link to Organizations. Nothing more.
3. **A super-admin-only "Admin" link** in the existing app navigation.

### Non-goals (YAGNI)

- Editing org fields (name / plan / billing) from the admin area.
- Deleting orgs or users.
- Email-invite or password-reset flows — temp-password handoff only, matching the
  existing create-org form.
- Impersonation / "log in as".
- Multi-org membership (the `User` model has a single `orgId`).
- Any UI to manage the `SUPER_ADMIN_EMAILS` allowlist — it stays env-only by
  design (see `lib/auth/superAdmin.ts`).

## Key facts that shape the design

- **No schema change.** `User.orgId` already exists; "add a user to an org" is
  just creating a `User` row with that `orgId`. Email is globally unique. This
  avoids every migration gotcha.
- **The repo layer is already org-parameterized.** `listUsers`, `createUser`,
  `findByEmail`, `updateRole`, `updateProfile`, `setArchived`, and `findUserRow`
  (all in `lib/repositories/userRepo.ts`) already take `orgId` as a parameter.
  The in-app routes pass the *caller's* org; the admin routes pass the *target*
  org from the URL. No new member repo functions are needed.
- **`updateRole` / `setArchived` already guard the last admin** — they throw
  `LastAdminError` if the change would leave an org with no active admin. Reusing
  them means an operator can't accidentally lock an org out.
- **No new API error codes.** Reuses `EMAIL_TAKEN`, `NOT_FOUND`,
  `VALIDATION_FAILED`, `LastAdminError` (400), and the `superAdmin` gate's
  `UNAUTHORIZED` (401) / `FORBIDDEN` (403).

## Auth plumbing: surfacing super-admin to the client

The navigation renders in a client component (`useSession`), but
`isSuperAdmin()` reads `process.env.SUPER_ADMIN_EMAILS`, which is **server-only**.
So the client can't call it directly. Surface it on the session, mirroring how
`role` / `orgId` already flow through the NextAuth callbacks:

- Augment `Session["user"]` with `isSuperAdmin: boolean` (module augmentation in
  `lib/auth.ts`).
- Set it in the **`session` callback**:
  `session.user.isSuperAdmin = isSuperAdmin(session.user.email)`.

The `session` callback runs server-side (env available) and re-evaluates on every
session read, so an allowlist change takes effect on the next session refresh —
no forced re-login. `session.user.email` is already populated by NextAuth from
the token before the callback runs (the existing `getInitials` relies on this).

## API routes

All gated by `apiRoute({ superAdmin: true })`. **The target org comes from the
URL param, never the caller's session org.** The `orgId` value the `apiRoute`
handler receives is the *operator's own* org and must be ignored on these routes;
handlers use `params.orgId`.

### `app/api/admin/orgs/[orgId]/users/route.ts`

- `GET` — validate the org exists (`getOrgById(params.orgId)`, else
  `NotFoundError`) → return `listUsers(params.orgId, { includeArchived: true })`.
- `POST` — body `{ name, email, role, password }` (same Zod shape as
  `POST /api/users`) → org exists → `findByEmail` guard (`EmailTakenError`) →
  `bcrypt.hash` → `createUser(params.orgId, …)`. Returns the new `UserRow`, 201.

### `app/api/admin/orgs/[orgId]/users/[userId]/route.ts`

- `PATCH` — body `{ role?, name?, title?, archived? }` (same Zod shape as
  `PATCH /api/users/[id]`) → reuse `updateRole` / `updateProfile` / `setArchived`
  / `findUserRow`, all scoped to `params.orgId`.

Because the `userRepo` functions filter on `{ id, orgId }`, a `userId` that
doesn't belong to `params.orgId` returns null → `NotFoundError` (no cross-org
user tampering). The in-app "can't demote/archive yourself" guard is **omitted**
here — the operator is acting on another org's users, not their own session user
— but the `LastAdminError` protection is preserved via the reused repo functions.

## Data access

New `lib/repositories/orgRepo.ts`:

- `getOrgById(id): Promise<{ id, name, slug, subscriptionStatus, createdAt } | null>`
  — used by the detail page (header) and by the routes as an existence check.

Added to the `lib/repositories/index.ts` barrel. Member reads/writes reuse the
existing `userRepo` functions unchanged. (The pre-existing `ORG_SELECT`
duplication between `app/(admin)/admin/orgs/page.tsx` and
`app/api/admin/orgs/route.ts` is left as-is — out of scope for this change.)

## Pages & components

### `/admin` dashboard — `app/(admin)/admin/page.tsx`

Server component, minimal, no client JS:

- Defense-in-depth super-admin guard (the layout renders `ForbiddenPanel`, but
  Next runs the page body in parallel with the layout, so guard the queries —
  same pattern as the existing orgs page).
- `prisma.organization.count()` + `prisma.user.count()`.
- Renders two stat tiles (Organizations, Users) and one card linking to
  `/admin/orgs`. That's the whole page.

### `/admin/orgs/[orgId]` org detail — `app/(admin)/admin/orgs/[orgId]/page.tsx`

Server component:

- Super-admin guard.
- `getOrgById(params.orgId)` → `notFound()` if missing.
- `listUsers(params.orgId, { includeArchived: true })` for the initial member
  list.
- Renders `<AdminOrgDetailView org={…} initialMembers={…} />`.

### `components/admin/orgs/detail/`

- `AdminOrgDetailView` — org header (name, slug, status, created), a
  "← Organizations" back link, and the members section (active list + archived
  list, mirroring the in-app `MembersView` layout).
- `AdminMemberRow` — role `<select>` + Archive/Restore button, wired to the
  update hook. No "self" concept.
- `AddAdminUserForm` — name / email / role / temp-password (with a "Suggest"
  generator), and a **post-create credential reveal**: on success it shows the
  email + temp password once, copyable, matching the existing `CreateOrgForm`
  "created" state, since the operator hands credentials off out-of-band.

Reuses the `MemberRole` / `MemberRow` **types** from
`components/settings/members/types.ts` (the row shape is identical — it's
`USER_SELECT`). The components themselves are admin-specific (different endpoint,
plus the credential reveal) rather than a refactor of the working in-app Members
page.

### `lib/hooks/useAdminOrgMembers.ts`

react-query hooks keyed on `["admin", "orgs", orgId, "users"]`:

- `useListAdminOrgMembers(orgId, initial)` → `GET /api/admin/orgs/${orgId}/users`
  with `initialData`.
- `useCreateAdminOrgMember(orgId)` → `POST …/users`, invalidates the list.
- `useUpdateAdminOrgMember(orgId)` → `PATCH …/users/${userId}`, invalidates the
  list.

## Navigation

- `lib/nav/items.ts`: add `ADMIN_ITEM` (`{ href: "/admin", label: "Admin",
  icon: "admin" }`) as a standalone export like `SETTINGS_ITEM`, and add
  `"admin"` to the `IconId` union. The Admin item is gated on **super-admin**,
  not role.
- `components/ui/nav-icons.tsx`: add an `admin` glyph (a shield).
- Thread `isSuperAdmin` from the session through the nav:
  - `AppNav` computes `isSuperAdmin = session?.user?.isSuperAdmin ?? false` and
    passes it to `NavDrawer`.
  - `SideNav` reads it from its own `useSession` and passes it to `NavMenu` (and
    adds `ADMIN_ITEM` to the collapsed `IconRail`).
  - `NavMenu` renders `ADMIN_ITEM` in the footer group next to Settings when
    `isSuperAdmin`.
- The mobile bottom bar is untouched — Admin lives in the "More" drawer.
- The existing `(admin)` layout keeps rendering `AppNav`, so the app sidebar
  stays visible inside `/admin` with "Admin" highlighted (`isItemActive("/admin",
  …)` matches `/admin` and all sub-routes).

## Error handling

| Situation | Result |
| --- | --- |
| Not signed in | 401 `UNAUTHORIZED` (apiRoute gate) |
| Signed in, not super-admin | 403 `FORBIDDEN` (apiRoute gate) |
| Org id not found | 404 `NOT_FOUND` (routes); `notFound()` (detail page) |
| User id not in that org | 404 `NOT_FOUND` |
| Duplicate email on add | 409 `EMAIL_TAKEN` |
| Invalid body | 400 `VALIDATION_FAILED` |
| Would leave org with no active admin | 400 `LAST_ADMIN` (`LastAdminError`) |

Client components read errors via `readApiError` and surface the message inline,
matching the existing member/org forms.

## Testing

- `__tests__/api/admin-org-users.test.ts` (mirrors `__tests__/api/admin-orgs.test.ts`):
  gate 401/403; `GET` lists members and 404s a missing org; `POST` 201 /
  400 validation / 409 `EMAIL_TAKEN` / 404 missing org; `PATCH` role + archive
  success, 404 when the user isn't in that org, 400 `LastAdminError`. Mocks
  `@/lib/repositories` + `@/lib/prisma` + `bcryptjs`, super-admin via
  `SUPER_ADMIN_EMAILS` + matching session email (same helper style as the
  existing test).
- `__tests__/lib/nav/items.test.ts`: assert `ADMIN_ITEM` shape.
- A small `NavMenu` component test: Admin link renders only when `isSuperAdmin`.
- E2E `tests/e2e/admin-org-users.spec.ts`: as the seeded super-admin
  (`admin@sqft.dev`) → `/admin` → Organizations → open an org → add a user →
  see it listed → change role → archive. Assert the Admin nav link is visible for
  a super-admin and absent for a normal user. (Runs in CI; not runnable in this
  worktree per the incomplete-`node_modules` gotcha.)

## Docs to update in the same change

- `AGENTS.md`: update the `(admin)` bullet and the navigation bullet; note the
  new API routes and `session.user.isSuperAdmin`.
- `CONTEXT.md`: update the **People** section — `/settings/members` manages the
  caller's *own* org; super-admins manage *any* org's members via
  `/admin/orgs/[orgId]`.

No new domain concepts, lifecycles, or error codes.
