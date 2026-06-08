<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SqFt — agent orientation

SqFt is a flooring-contractor app (Next.js + Prisma/Postgres, react-query,
biome, Vitest + Playwright). The core record chain is
**Customer → Location → SiteMeasure → Estimate → Invoice**, everything
org-scoped.

**Read `CONTEXT.md` before working on the estimate / invoice / site-measure
domain.** It is the domain glossary and carries the load-bearing rules: the
single-source-of-truth math (`computeEstimateView`), the edit reducer
(`reduceEstimateDraft`), markup folding, invoice billing/proration, the
estimate & invoice lifecycles, and the API error-code contract — each paired
with the file that owns it.

## Where things live

- `app/(app)/` — authed builder UI, one route group per domain (`customers`,
  `estimates`, `invoices`, `site-measures`, `schedule`, `my-schedule`,
  `settings`). The read-only, mobile-first **My Schedule** day view
  (`app/(app)/my-schedule`, `components/schedule/MyScheduleView` +
  `EventCard`/`JobCard`/`DayAgenda`, pure logic in `lib/schedule/agenda.ts`)
  lives alongside the editable **Schedule Manager** grid (`/schedule`, lead+
  only; crew is redirected here); both read `useEvents`.
  Auth is `app/(auth)/login`, admin is `app/(admin)/admin`. Public
  customer-facing pages are `app/estimate-review/[token]` and
  `app/invoice-review/[token]`. **People are Users** (no crew roster): managed
  on the admin **Members** page (`/settings/members`) — role, job title,
  archive/restore — and assigned to schedule Events via `Event.assignees`.
- **Navigation** is defined once in `lib/nav/items.ts` (grouped destinations,
  role-gating via `navGroupsFor`, the mobile bottom-bar shortcuts, and the
  `isItemActive`/`isMoreActive` helpers) and rendered by
  `components/ui/AppNav.tsx` — a persistent collapsible **`SideNav`** on desktop
  (md+), and on mobile a fixed **`MobileTabBar`** (4 shortcuts + More) opening a
  full-menu **`NavDrawer`**; crew get a slim top bar instead of the bottom bar.
  `SideNav` and `NavDrawer` share `NavMenu` + `AccountBlock`; icons live in
  `nav-icons.tsx` keyed by `IconId`. (The old `MobileSessionSheet` is gone.)
- `app/api/` — route handlers, one folder per resource. They wrap `apiRoute`
  (`lib/api/route.ts`) and return the `{ error: { code, … } }` envelope defined
  in `lib/api/errors.ts` (`ApiError`, `readApiError`).
- `lib/estimateView/` — **estimate math, single source of truth**:
  `compute.ts` (`computeEstimateView`), `fromPrisma.ts` (Prisma→input adapter),
  `markup.ts` (`foldMarkupIntoLines`), `snapshot.ts`.
- `lib/estimateDraft/` — **pure edit reducer** (`reduceEstimateDraft`); the
  save policy lives here, not in the React layer.
- `lib/invoices/` — **billing math** (`computeEstimateBilling`,
  `prorateInvoice`) plus invoice `snapshot.ts` / `schema.ts`.
- `lib/money.ts` — shared cents rounding (`round2`, `residualTargetIndex`).
- `lib/repositories/` — all Prisma data access, org-scoped (`*Repo.ts`);
  `userRepo.ts` owns all `User` access (assignable list, archive guard,
  `validateUserIds`).
- `lib/hooks/` — react-query hooks (`useEstimates`, `useInvoices`, …).
- `lib/email/` — React-Email templates + Resend senders.
- `lib/tenant.ts` — org scoping; `lib/prisma.ts` — Prisma client;
  `lib/utils.ts` — `fmtDollar` and friends.
- `components/` — UI grouped by domain (`estimates`, `invoices`,
  `siteMeasures`, …) plus shared `components/ui/` (`Modal`, `Button`, `Toast`).
- `prisma/` — schema, migrations, `seed.ts`. Design docs and plans live in
  `specs/` and `docs/superpowers/` (e.g.
  `docs/superpowers/specs/2026-06-05-invoice-ui-design.md`).

## Commands

- `npm run dev` — dev server.
- `npm run lint:ci` (`biome ci .`) — **must pass before any commit/PR**;
  `npm run lint:fix` auto-fixes.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` (`vitest run`) — unit + component tests.
- `npm run test:e2e` — Playwright. **Run with `--workers=1` locally** to match
  CI and avoid known parallel-contention flakiness.
- `npm run migrate:dev` — apply migrations (`prisma migrate deploy`);
  `npm run seed:dev` — seed the dev DB.

## Gotchas

- **Never squash migrations.** Vercel runs `prisma migrate deploy` at deploy;
  squashing breaks the deploy (and E2E). Add new migrations on top.
- `ADD COLUMN NOT NULL` passes on an empty dev DB but **fails the populated
  Neon PR branch** (existing rows → `23502`). Backfill first, enforce NOT NULL
  in a later migration.
- A fresh worktree may have an **incomplete `node_modules`** (missing
  `@prisma/client` / `pg`) — `next dev`, E2E, and the DB/email vitest suites
  can't run there until you `npm install`.

## Keeping these docs current

`CONTEXT.md` and this file are the cross-session memory that lets the next
agent skip re-deriving the codebase. They only stay useful if the session that
changes the shape of the code updates them **in the same change**:

- **Update `CONTEXT.md`** when you add / rename / retire a domain concept,
  change a single-source-of-truth computation, alter a lifecycle or status set,
  change a draft's save/edit semantics, or add / rename an API error code. Edit
  the affected section *and the file pointer inside it* — don't just append.
- **Update this file (`AGENTS.md`)** when you add or move a top-level module
  (`lib/*`, an `app/*` route group, a `components/*` domain), add a
  script/command, or learn a new repo-wide gotcha.
- The bar is *"would the next agent be misled by the text as it stands?"* — not
  "touch a doc every commit." A change that needs no doc edit is fine.
- Keep edits surgical and high-signal: these files are read on every session,
  so a stale line costs more than a missing one.

# Before Finishing Work

Before marking any task complete, opening a PR, or committing:

1. **Run lint** — `biome ci .` must pass with no errors.
2. **Update seed script** — if you changed the database schema (added/removed tables, columns, or relations), update the seed script to reflect those changes.
3. **All tests must pass** — run the full test suite and fix any failures before handing off.
4. **Sync the context docs** — if the change added/altered a domain concept, module layout, command, or error code, update `CONTEXT.md` / `AGENTS.md` in the same change (see *Keeping these docs current*).
