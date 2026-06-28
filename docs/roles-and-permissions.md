# Roles & Permissions

What each role can do in SqFt. **This is a living document** — when you add a
role check, gate a route, or change `minRole` on an endpoint, update the matching
row(s) here in the same change. See [Keeping this current](#keeping-this-current).

> Source of truth (don't trust this doc over the code — fix the doc if they
> diverge):
> - Roles & hierarchy: `prisma/schema.prisma` (Role enum) + `lib/auth/permissions.ts` (`ROLE_RANK`, `hasMinRole`)
> - API gating: each handler's `minRole` in `app/api/**/route.ts`, enforced by `lib/api/route.ts`
> - Page gating: per-page `requireSession()` + `hasMinRole()` + `redirect()` in `app/(app)/**/page.tsx`
> - Super-admin: `lib/auth/superAdmin.ts` (`SUPER_ADMIN_EMAILS` env), enforced in `app/(admin)/layout.tsx`

## The roles

There are **three org roles** in a strict hierarchy plus one out-of-band level.
Higher rank includes everything the lower ranks can do (`admin ≥ lead ≥ crew`).

| Role | Rank | One-liner |
|------|------|-----------|
| **crew** | 0 | Field worker. Read-only schedule, sees their own assignments. No business data. |
| **lead** | 1 | Runs the business: customers, site measures, estimates, invoices, scheduling. |
| **admin** | 2 | Everything lead can do **+** workspace settings and member management. |
| **super-admin** | — | Platform operator (SqFt staff). **Not an org role** — granted by `SUPER_ADMIN_EMAILS` env var. Only gates the `(admin)` route group. |

`ROLE_RANK = { crew: 0, lead: 1, admin: 2 }` — `lib/auth/permissions.ts`.
Login lands crew on `/my-schedule`, everyone else on `/` (`homePathFor`).

## What each role can do (by feature)

✓ = full access · 👁 = read-only · ✗ = blocked (redirected to their home page)

| Feature / Page | crew | lead | admin |
|----------------|:----:|:----:|:-----:|
| **My Schedule** (`/my-schedule`) — own day view | 👁 | ✓ | ✓ |
| **Schedule Manager** (`/schedule`) — edit events grid | ✗ | ✓ | ✓ |
| **Dashboard / KPIs** (`/`) | ✗ | ✓ | ✓ |
| **Customers** (`/customers`) — list, create, edit, delete | ✗ | ✓ | ✓ |
| **Site Measures** (`/site-measures`) — create, edit, delete | ✗ | ✓ | ✓ |
| **Estimates** (`/estimates`) — build, send, revise, delete | ✗ | ✓ | ✓ |
| **Invoices** (`/invoices/[id]`) — view, send, record payment, void | ✗¹ | ✓ | ✓ |
| **Line item templates** (`/settings/line-item-templates`) | ✗ | ✓ | ✓ |
| **Settings** home (`/settings`) | ✗ | ✓ | ✓ |
| **Workspace settings** (`/settings/workspace`) — brand, estimate defaults | ✗ | ✗ | ✓ |
| **Members** (`/settings/members`) — add/edit teammates, set roles, archive | ✗ | ✗ | ✓ |
| **Platform admin** (`/admin/*`) | ✗ | ✗ | ✗² |

¹ The invoice **view page** has no role gate, but the only way to reach an invoice
is through estimates/customers, which are lead+. Treat invoices as lead+ in practice.
² Platform admin is super-admin only — even an org admin gets a 403.

### Notes on a few rows

- **crew is read-only on the schedule.** `GET /api/events` is open to all
  authenticated users; creating/editing/deleting events is lead+. Crew sees the
  day view but can't change it.
- **Self-service guards on Members** (admin-only page): you can't demote
  yourself (`CANNOT_DEMOTE_SELF`) and you can't remove/demote the last admin in
  an org (`LAST_ADMIN`).
- **People = Users.** There's no separate crew roster; teammates are Users
  managed on the Members page and assigned to events via `Event.assignees`.

## API authorization (by endpoint)

How each endpoint is gated. "auth only" = any logged-in user regardless of role.

### Open to all authenticated roles (incl. crew)
| Method | Endpoint |
|--------|----------|
| GET | `/api/events` |
| GET | `/api/org` |
| GET | `/api/invoices/[id]` |
| GET | `/api/estimates/[id]/invoices` |

### Require **lead** (lead + admin)
| Method | Endpoint |
|--------|----------|
| GET/POST | `/api/customers` · `/api/customers/[id]` (GET/PATCH/DELETE) |
| GET/POST | `/api/site-measures` · `/api/site-measures/[id]` (GET/PATCH/DELETE) |
| GET/POST | `/api/estimates` · `/api/estimates/[id]` (GET/PATCH/DELETE) |
| POST | `/api/estimates/[id]/send`, `/revise`, `/approval-token`, `/invoices` |
| POST/PATCH/DELETE | `/api/events`, `/api/events/[id]` |
| GET | `/api/dashboard/kpis`, `/api/dashboard/revenue` |
| GET/POST/PATCH/DELETE | `/api/line-item-templates`, `/api/line-item-templates/[id]` |
| GET/POST | `/api/locations` |
| POST | `/api/invoices/[id]/send`, `/payments`, `/void` |
| GET | `/api/address/autocomplete`, `/api/users/assignable` |

### Require **admin**
| Method | Endpoint |
|--------|----------|
| PATCH | `/api/org` |
| GET/POST | `/api/users` |
| PATCH | `/api/users/[id]` |

### Super-admin only
- The entire `(admin)` route group — gated in `app/(admin)/layout.tsx`.

## Keeping this current

Update this doc **in the same change** when you:

- Add or rename a role, or change the hierarchy → update [The roles](#the-roles).
- Add/remove a page gate or change its `minRole` → update the feature matrix.
- Add an API route or change a handler's `minRole` → update the API tables.
- Add a self-service guard or new error code (e.g. like `LAST_ADMIN`) → note it.

The bar: *would a teammate be misled by this doc as it stands?* If yes, fix it.
