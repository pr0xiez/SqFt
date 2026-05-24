# Members & Role Enforcement — Spec C

Date: 2026-05-24
Scope: Members page at `/settings/members`, the `Admin | Lead | Crew`
permission gates across every existing surface, and a `hasMinRole`
utility plus a `minRole` parameter on `apiRoute`.

Spec A landed the role values (`admin | lead | crew`) and migrated
existing data. Spec C is the enforcement counterpart.

## Goal

Three roles, three reach levels.

- **Admin** — full access including workspace settings, member
  management, and quote/estimate/customer/dashboard work.
- **Lead** — everything Admin can do, except workspace settings and
  member management.
- **Crew** — Schedule and Crew roster (view-only). No business surfaces
  (dashboard, estimates, quotes, customers). No settings.

The "job card" surface where Crew writes per-day notes is future work
and out of scope.

## Decisions

- **Permission model is hierarchical, not capability-based.** Roles
  form a rank (`crew=0, lead=1, admin=2`). Gates are expressed as
  "at least lead" or "at least admin". Capability strings would add
  ceremony without expressiveness for this model.
- **Single route wrapper.** `apiRoute` gains an optional `minRole`
  option (`"lead" | "admin"`). `adminRoute` is deleted and its one
  caller migrates. `publicRoute` is unchanged.
- **Members page is its own page** at `/settings/members`, not a
  section of `/settings/workspace`. Matches the
  `/settings/line-item-templates` precedent of one settings concern
  per page.
- **Invite flow is direct creation, not email.** Admin types name,
  email, role, and a temporary password into an inline form. No magic
  link, no pending state. The admin hands the password off out-of-band.
- **No member removal in this spec.** Role changes only. (The design
  HTML doesn't show a remove control either.) A future spec adds
  deactivation if needed.
- **No `lastSeenAt`.** The design shows a "Last seen" column; we
  omit it. Tracking an attribute that requires throttled writes on
  every authenticated request is overkill for a small workspace tool.
- **Crew's home is `/schedule`.** Login redirect and "insufficient
  role" redirects both go through `homePathFor(role)` so the rule is
  in one place.
- **Nav and `/settings` index filter by role.** Crew sees only
  Schedule + Crew in the top/bottom nav. Lead sees everything except
  the Members card on `/settings`. Admin sees everything.
- **Crew reads of `/api/events` and `/api/crew-members` are allowed.**
  Mutations on those endpoints require Lead. The schedule and crew
  views render the same components for everyone, but create/edit/delete
  affordances and the `EventFormPanel` only render when
  `hasMinRole(role, "lead")`.

## `lib/auth/permissions.ts` — new file

```ts
export const ROLE_RANK = { crew: 0, lead: 1, admin: 2 } as const;
export type Role = keyof typeof ROLE_RANK;

export function hasMinRole(role: string, min: Role): boolean {
  const r = ROLE_RANK[role as Role];
  return r !== undefined && r >= ROLE_RANK[min];
}

export function homePathFor(role: string): string {
  return role === "crew" ? "/schedule" : "/";
}
```

That's the entire module. Both functions are pure; no IO.

## `lib/api/route.ts` — `minRole` option

Add to `RouteOptions`:

```ts
type RouteOptions<TInput> = {
  input?: ZodType<TInput>;
  status?: number;
  minRole?: "lead" | "admin";
};
```

Inside `apiRoute`, after the existing session/org resolution:

```ts
if (options.minRole) {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, options.minRole)) {
    throw new UnauthorizedError();
  }
}
```

`apiRoute` already calls `requireSession()` transitively via
`getOrgId()`, so the extra explicit call is cheap (it reads from the
same per-request cache). Errors flow through the existing envelope as
`UNAUTHORIZED` (401).

Usage:

```ts
export const GET   = apiRoute({ minRole: "lead" }, async ({ orgId }) => { … });
export const PATCH = apiRoute({ minRole: "admin", input: schema }, async ({ … }) => { … });
```

`adminRoute` is deleted. Its one production caller
(`app/api/org/route.ts` PATCH) migrates to
`apiRoute({ minRole: "admin", input: orgPatchSchema })`. The
`__tests__/lib/api/adminRoute.test.ts` file folds into
`__tests__/lib/api/route.test.ts` (covering both `minRole: "lead"` and
`minRole: "admin"` shapes). `CONTEXT.md` is updated to describe the
single wrapper.

## Permission matrix

For every current surface in the app:

| Surface                                           | Admin | Lead     | Crew     |
|---------------------------------------------------|:-----:|:--------:|:--------:|
| `/` (dashboard: KPIs, revenue, estimates, etc.)  |   ✓   |    ✓     | → /schedule |
| `/settings`                                       |   ✓   |    ✓     | → /schedule |
| `/settings/workspace`                             |   ✓   | → /settings | → /settings |
| `/settings/members` (new)                         |   ✓   | → /settings | → /settings |
| `/settings/line-item-templates`                   |   ✓   |    ✓     | → /schedule |
| `/estimates`, `/estimates/[id]`                   |   ✓   |    ✓     | → /schedule |
| `/quotes`, `/quotes/[id]`, `/quotes/[id]/signed`  |   ✓   |    ✓     | → /schedule |
| `/customers`, `/customers/[id]`                   |   ✓   |    ✓     | → /schedule |
| `/schedule`                                       |   ✓   |    ✓     |    ✓ (view) |
| `/crew`                                           |   ✓   |    ✓     |    ✓ (view) |
| `GET /api/dashboard/kpis`, `…/revenue`            |   ✓   |    ✓     |   401    |
| `GET /api/estimates`, write APIs                  |   ✓   |    ✓     |   401    |
| `GET /api/quotes`, write APIs                     |   ✓   |    ✓     |   401    |
| `GET /api/customers`, write APIs                  |   ✓   |    ✓     |   401    |
| `GET /api/line-item-templates`, write APIs        |   ✓   |    ✓     |   401    |
| `GET /api/events`                                 |   ✓   |    ✓     |    ✓     |
| `POST/PATCH/DELETE /api/events*`                  |   ✓   |    ✓     |   401    |
| `GET /api/crew-members`                           |   ✓   |    ✓     |    ✓     |
| `POST/PATCH/DELETE /api/crew-members*`            |   ✓   |    ✓     |   401    |
| `GET /api/org`                                    |   ✓   |    ✓     |    ✓     |
| `PATCH /api/org`                                  |   ✓   |   401    |   401    |
| `GET/POST /api/users` (new)                       |   ✓   |   401    |   401    |
| `PATCH /api/users/[id]` (new)                     |   ✓   |   401    |   401    |
| `/api/q/[token]/*` (customer-facing)              |   public — unchanged                       |
| `/api/auth/*` (NextAuth)                          |   public — unchanged                       |

### Route migration

Each migration is "add `minRole` to the options" — no other change:

| File                                                | Change                              |
|-----------------------------------------------------|-------------------------------------|
| `app/api/dashboard/kpis/route.ts`                   | `minRole: "lead"`                   |
| `app/api/dashboard/revenue/route.ts`                | `minRole: "lead"`                   |
| `app/api/estimates/route.ts`                        | `minRole: "lead"`                   |
| `app/api/estimates/[id]/route.ts`                   | `minRole: "lead"`                   |
| `app/api/quotes/route.ts`                           | `minRole: "lead"`                   |
| `app/api/quotes/[id]/route.ts`                      | `minRole: "lead"`                   |
| `app/api/quotes/[id]/send/route.ts`                 | `minRole: "lead"`                   |
| `app/api/quotes/[id]/revise/route.ts`               | `minRole: "lead"`                   |
| `app/api/quotes/[id]/approval-token/route.ts`       | `minRole: "lead"`                   |
| `app/api/customers/route.ts`                        | `minRole: "lead"`                   |
| `app/api/customers/[id]/route.ts`                   | `minRole: "lead"`                   |
| `app/api/line-item-templates/route.ts`              | `minRole: "lead"`                   |
| `app/api/line-item-templates/[id]/route.ts`         | `minRole: "lead"`                   |
| `app/api/events/route.ts` GET                       | no change                           |
| `app/api/events/route.ts` POST                      | `minRole: "lead"`                   |
| `app/api/events/[id]/route.ts` PATCH, DELETE        | `minRole: "lead"`                   |
| `app/api/crew-members/route.ts` GET                 | no change                           |
| `app/api/crew-members/route.ts` POST                | `minRole: "lead"`                   |
| `app/api/crew-members/[id]/route.ts` PATCH, DELETE  | `minRole: "lead"`                   |
| `app/api/org/route.ts` GET                          | no change                           |
| `app/api/org/route.ts` PATCH                        | swap `adminRoute` → `apiRoute` with `minRole: "admin"` |
| `app/api/users/route.ts` (new)                      | `minRole: "admin"`                  |
| `app/api/users/[id]/route.ts` (new)                 | `minRole: "admin"`                  |

## `/settings/members` — Members page

```
app/(app)/settings/members/page.tsx        ← NEW (server component)
components/settings/members/
  MembersView.tsx                          ← client root
  MemberRow.tsx                            ← one row: name, email, role dropdown
  AddMemberForm.tsx                        ← inline "+ Invite member" form
  types.ts                                 ← shared types
```

`app/(app)/settings/members/page.tsx`:

1. `const session = await requireSession();`
2. `if (session.user.role !== "admin") redirect("/settings");`
3. Load all users in the org via Prisma: `{ id, name, email, role }`.
   Order by `createdAt asc` so the org creator is at the top.
4. Render `<MembersView initial={users} currentUserId={session.user.id} />`.
5. `export const metadata = { title: "Members · Settings · SqFt" };`

### `MembersView`

- Holds the list in state (initialized from `initial`).
- Renders a `MemberRow` for each user, with the role dropdown disabled
  on the row whose `id === currentUserId` (you can't change your own
  role).
- Each role change fires a `PATCH /api/users/[id]` mutation
  (react-query). Optimistic update; on error, revert and toast.
- Renders an `AddMemberForm` below the table. Submit calls
  `POST /api/users`, appends the new user to the list on success.
- No save/revert bar — single-field PATCHes are committed on change.

### `AddMemberForm`

Fields: `name`, `email`, `role` (default `crew`), `password`. The
password is shown in plaintext (it's a temporary value the admin
generates themselves — there's no point in obscuring it). On success
the form resets and collapses; the new row appears in the table. Error
codes surfaced inline: `EMAIL_TAKEN`, `VALIDATION_FAILED`.

### `/settings` index filters by role

`SETTINGS_LINKS` becomes a function of role:

```ts
function settingsLinksFor(role: Role) {
  const links = [];
  if (role === "admin") {
    links.push({
      href: "/settings/workspace",
      title: "Workspace",
      description: "Company identity, brand, and the defaults that new quotes inherit.",
    });
    links.push({
      href: "/settings/members",
      title: "Members",
      description: "Add teammates and set what they can see and do.",
    });
  }
  links.push({
    href: "/settings/line-item-templates",
    title: "Line item templates",
    description: "Reusable line items that auto-populate on new quotes.",
  });
  return links;
}
```

The page also redirects Crew up front:

```ts
if (session.user.role === "crew") redirect("/schedule");
```

## `/api/users` — new endpoints

`app/api/users/route.ts`:

- **`GET`** — `apiRoute({ minRole: "admin" }, …)`. Lists users in the
  org: `{ id, name, email, role, createdAt }`.
- **`POST`** — `apiRoute({ minRole: "admin", input: createUserSchema }, …)`.
  Validates, bcrypts the password, creates the User. Returns the new
  row (no password). On unique violation on `email`, returns
  `EMAIL_TAKEN` (409).

`app/api/users/[id]/route.ts`:

- **`PATCH`** — `apiRoute({ minRole: "admin", input: patchUserSchema }, …)`.
  Only `role` is patchable in this spec. Guardrails:
  - Rejects with `CANNOT_DEMOTE_SELF` (400) if `params.id === session.user.id` and `input.role !== "admin"`.
  - Rejects with `LAST_ADMIN` (400) if the change would leave the org with zero admins (counts admins in the same transaction).

### Zod schemas

```ts
const createUserSchema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email().toLowerCase().max(254),
  role:     z.enum(["admin", "lead", "crew"]),
  password: z.string().min(8).max(200),
});

const patchUserSchema = z.object({
  role: z.enum(["admin", "lead", "crew"]),
});
```

### New error codes

Added to `lib/api/errors.ts`:

- `EMAIL_TAKEN` (409) — email already exists in this org.
- `CANNOT_DEMOTE_SELF` (400) — admin tried to change their own role.
- `LAST_ADMIN` (400) — role change would leave the org with no admins.

## Page-level redirects across the app

Every `(app)/**` page server component grows three lines:

```ts
const session = await requireSession();
if (!hasMinRole(session.user.role, MIN_ROLE_FOR_THIS_PAGE))
  redirect(homePathFor(session.user.role));
```

The `MIN_ROLE_FOR_THIS_PAGE` value per page follows the matrix above.
Pages reachable by Crew (`/schedule`, `/crew`) skip the gate entirely.

`/settings/workspace` already has an admin check — its existing
redirect to `/settings` stays as-is. (For Lead, that lands them on a
page they can use; for Crew, `/settings` itself redirects to
`/schedule`, so it works out in two hops without special casing.)

## Nav filtering

`components/app/AppNav.tsx` (or wherever the nav links live) derives
the link list from `session.user.role`:

```ts
function navLinksFor(role: Role) {
  if (role === "crew") return ["Schedule", "Crew"];
  if (role === "lead") return ["Dashboard", "Customers", "Estimates", "Quotes", "Schedule", "Crew", "Settings"];
  return            ["Dashboard", "Customers", "Estimates", "Quotes", "Schedule", "Crew", "Settings"];
}
```

(Admin and Lead get the same top-nav link set — the difference is
inside `/settings`.) Same logic applies to the mobile bottom nav. The
role is already on `session.user`, threaded through whatever nav
context exists today.

## Schedule and Crew view affordances

Both views render the same components for Crew as for Lead/Admin. The
affordances differ:

- `components/schedule/CalendarGrid.tsx` — accepts a `canEdit: boolean`
  prop. When `false`, click-to-create-event is disabled, edit
  affordances on event cards are hidden, and the `EventFormPanel`
  is not mounted. Read-only event tooltips/details still work.
- `components/crew/CrewRosterView.tsx` — accepts `canEdit: boolean`.
  When `false`, the inline add/edit/archive controls are not rendered;
  the roster is a plain list.

`canEdit` is computed in the page server component
(`hasMinRole(session.user.role, "lead")`) and passed in. No client-side
permission logic.

## Login redirect

NextAuth's `signIn` callback (or the post-login page in
`app/(auth)/**`) routes to `homePathFor(session.user.role)` after a
successful sign-in. Crew lands on `/schedule`, everyone else lands on
`/`.

## Seed

`prisma/seed.ts` adds two demo users to each demo org for manual
testing convenience:

```ts
{ name: "Marcus Chen", email: "lead@sqft.dev", role: "lead", password: "demo1234" }
{ name: "Diego Marín", email: "crew@sqft.dev", role: "crew", password: "demo1234" }
```

(Names match the design mockup data.) Playwright doesn't depend on
these — see Testing.

## Testing

### Vitest unit

- `hasMinRole` — every (role, min) pair; unknown role returns `false`.
- `homePathFor` — `crew → /schedule`, everything else → `/`.

### Vitest integration (test-DB harness)

- `apiRoute({ minRole: "lead" }, …)` — 401 for crew session, 200 for
  lead and admin.
- `apiRoute({ minRole: "admin" }, …)` — 401 for crew and lead, 200
  for admin.
- `apiRoute()` with no `minRole` — passes for any authenticated session,
  401 for unauthenticated.
- `POST /api/events` — 401 for crew, 200 for lead (one route smoke; the
  rest follow mechanically from the wrapper behaviour).
- `POST /api/estimates` — 401 for crew, 200 for lead (second smoke,
  different table).
- `GET /api/events` — 200 for crew (read-only is allowed).
- `POST /api/users` — 401 for non-admin, 201 for admin; `EMAIL_TAKEN`
  on duplicate email.
- `PATCH /api/users/[id]` — `CANNOT_DEMOTE_SELF` when admin patches own
  role to lead/crew; `LAST_ADMIN` when demoting the only admin in the
  org.
- Migration of `/api/org` PATCH from `adminRoute` to
  `apiRoute({ minRole: "admin" })` — existing tests pass unchanged.

### Playwright

Each test creates the users it needs via a fixture
(`tests/e2e/fixtures/users.ts`) using direct Prisma access with unique
emails (`lead-${randomId}@playwright.test`,
`crew-${randomId}@playwright.test`,
`admin-${randomId}@playwright.test`). Cleanup runs in `afterAll` and
deletes the fixture users. No reliance on seed data.

Scenarios:

- **Crew login** — top nav shows only Schedule + Crew. Visiting
  `/`, `/estimates`, `/quotes`, `/customers`, `/settings`,
  `/settings/workspace`, or `/settings/members` redirects to
  `/schedule`. Visiting `/schedule` renders the calendar without
  create/edit affordances.
- **Lead login** — `/settings` shows only the Line-item-templates
  card. Visiting `/settings/workspace` or `/settings/members`
  redirects back to `/settings`. `/schedule` shows the
  `EventFormPanel` affordances.
- **Admin login** — `/settings/members` lists users, changing
  another user's role via the dropdown updates the row; a refresh
  shows the persisted role.

## What this spec does NOT do

- Member removal or deactivation. Role changes only.
- Self-service password reset / change. Admin sets a temp password;
  a separate account-settings spec adds self-service later.
- Email invitations. Admin hands the temp password off out-of-band.
- Audit log of role changes.
- The "job card" Crew daily-notes feature. Future spec.
- `lastSeenAt` tracking.
- Any Crew-specific dashboard. Crew home is `/schedule`.
- Per-resource ownership ("Lead can only edit quotes they created").
  The model is role-only, not resource-owner-aware.

## Open follow-up specs (informational)

- Spec D — Integrations (QuickBooks Online, Stripe, Google Calendar).
- Job Card — Crew per-day notes on assigned schedule events.
- Member deactivation + audit log + email invitations, if/when needed.
