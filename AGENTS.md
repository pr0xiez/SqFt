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
  only; crew is redirected here); both read `useEvents`. The grid's geometry
  (overlap lanes, 7a–7p clamping, click-to-time snap, now-line) is pure logic
  in `lib/schedule/grid.ts`, and its **unscheduled-jobs backlog** (approved
  estimates with no job event; `components/schedule/BacklogStrip`) projects
  via `lib/schedule/backlog.ts` from `GET /api/estimates/schedulable`.
  The org-wide **Invoices** list (`app/(app)/invoices`,
  `components/invoices/InvoiceList`) defaults to the "All" filter, with an
  "Open" pill (sent + viewed + partial) second, and is lead+ only.
  Auth is `app/(auth)/login`. Public customer-facing pages are
  `app/estimate-review/[token]` and `app/invoice-review/[token]`. **People are
  Users** (no crew roster): managed on the admin **Members** page
  (`/settings/members`) — role, job title, archive/restore — and assigned to
  schedule Events via `Event.assignees`.
- `app/(admin)/admin` — the **super-admin console** (gated by
  `SUPER_ADMIN_EMAILS`, see `lib/auth/superAdmin.ts`): a minimal `/admin`
  dashboard (org/user counts + a link), an `/admin/orgs` list (+create-org
  form), and an `/admin/orgs/[orgId]` detail page with **full member
  management** — add user, change role, archive/restore — via
  `/api/admin/orgs/[orgId]/users[/[userId]]`, all gated by
  `apiRoute({ superAdmin: true })`.
- **Navigation** is defined once in `lib/nav/items.ts` (grouped destinations,
  role-gating via `navGroupsFor`, the mobile bottom-bar shortcuts, and the
  `isItemActive`/`isMoreActive` helpers) and rendered by
  `components/ui/AppNav.tsx` — a persistent collapsible **`SideNav`** on desktop
  (md+), and on mobile a fixed **`MobileTabBar`** (4 shortcuts + More) opening a
  full-menu **`NavDrawer`**; crew get a slim top bar instead of the bottom bar.
  `SideNav` and `NavDrawer` share `NavMenu` + `AccountBlock`; icons live in
  `nav-icons.tsx` keyed by `IconId`. (The old `MobileSessionSheet` is gone.)
  Both also host the lead+ **"+ New" quick-create launcher** (`NewMenu`); see
  *Quick Create* in `CONTEXT.md`. The super-admin-only **`ADMIN_ITEM`** link to
  `/admin` is rendered by `NavMenu`/`SideNav`/`NavDrawer` when
  `session.user.isSuperAdmin` is true.
- `app/api/` — route handlers, one folder per resource. They wrap `apiRoute`
  (`lib/api/route.ts`) and return the `{ error: { code, … } }` envelope defined
  in `lib/api/errors.ts` (`ApiError`, `readApiError`).
- `lib/estimateView/` — **estimate math, single source of truth**:
  `compute.ts` (`computeEstimateView`), `fromPrisma.ts` (Prisma→input adapter),
  `markup.ts` (`foldMarkupIntoLines`), `snapshot.ts` (write side of the
  approval snapshot), `parseSnapshot.ts` (read side: zod-validates the stored
  JSON and rebuilds the frozen view the public page renders for approved
  estimates).
- `lib/estimateDraft/` — **pure edit reducer** (`reduceEstimateDraft`); the
  save policy lives here, not in the React layer.
- `lib/invoices/` — **billing math** (`computeEstimateBilling`,
  `prorateInvoice`) plus invoice `snapshot.ts` / `schema.ts`.
- `lib/send/` — **the send pipeline**: `runSendPipeline` (the one spine behind
  "email a customer-facing document") plus the per-document `Sendable`
  adapters (`sendEstimate.ts`, `sendInvoice.ts`). Both send routes are thin
  callers; ordering/error invariants live here (see *Send Pipeline* in
  `CONTEXT.md`).
- `lib/dashboard/approvedRevenue.ts` — shared **approved-revenue query**
  (`getApprovedEstimateRevenueRows`, `getMtdApprovedEstimates`): the one place
  that queries approved estimates in a date range and reduces them via
  `computeEstimateView`. Both `getDashboardKpis` (`lib/dashboard/kpis.ts`,
  `bookedRevenueMtd`) and `getDashboardRevenue` (`lib/dashboard/revenue.ts`,
  `mtdTotal` + weekly buckets) call it instead of each defining its own
  "what counts as MTD approved revenue" — add any future MTD-revenue logic
  here, not by re-deriving it in either dashboard function.
- `lib/quickCreate/` — **pure quick-create logic** (`toInvoiceableCandidates`):
  projects estimates to billable candidates (`unbilled > 0`) for the
  quick-invoice search. The global **"+ New" launcher** UI lives in
  `components/quick-create/` (`QuickCreateProvider` mounts the slide-overs;
  `NewMenu` is the trigger), candidates come from
  `GET /api/estimates/invoiceable`. See *Quick Create* in `CONTEXT.md`.
- `lib/qbo/` — **QuickBooks Online sync** (one-way push; see *QuickBooks
  Sync* in `CONTEXT.md`): `config.ts` (env + endpoints incl. the `mock`
  environment), `crypto.ts` (AES-256-GCM token encryption), `client.ts`
  (`qboFetch`, typed `QboApiError`, minorversion pin), `connect.ts` (OAuth,
  signed state, token exchange), `mapping.ts` (pure snapshot→QBO builders),
  `sync.ts` (port-based ensure-op engine + task runner), `port.ts` (real
  `QboPort` over qboFetch), `runner.ts` (after()/cron glue),
  `mockRealm.ts` (test-only mock realm logic). Prisma side lives in
  `lib/repositories/qboRepo.ts` (connection lifecycle, single-flight token
  refresh, links, task outbox). Routes: `app/api/qbo/*` (connect / callback /
  disconnect / status / sync-run cron) + `app/api/invoices/[id]/qbo-sync`
  (manual retry) + `app/api/qbo-mock/*` (mock realm,
  `QBO_ENVIRONMENT=mock` only). Admin UI: `/settings/integrations`
  (`QuickBooksCard`, `SyncHealthPanel`); per-invoice `QboSyncBadge`.
- `lib/stripe/` — **Stripe Connect integration**: `client.ts` (Stripe SDK
  singleton, API version pin), `connect.ts` (account create/retrieve,
  `ConnectStatus` union, onboarding-link generation, plus
  `summarizeRequirements`/`readAccountStatusDetail` — collapses v2 requirement
  entries into `{actionDue, inReview, issues}` so the settings page can say
  whether the user or Stripe is the one holding up onboarding, and *which*
  requirements failed; `readAccountStatus` is the status-only read used on the
  customer checkout path), `connectPhase.ts` (**client-safe, no SDK import** —
  the `connectPhase`/`connectPollInterval` selector shared by
  `PaymentsSettingsView` and `useStripeConnect`, plus the
  `StripeConnectStatus` wire type), `checkout.ts` (`buildCheckoutParams`,
  `createInvoiceCheckoutSession` — creates the Checkout Session on the
  connected account), `webhook.ts` (`constructStripeEvent`,
  `handleStripeEvent` — signature-verified event handler). The admin Stripe
  onboarding surface is `/settings/payments` (`app/(app)/settings/payments`,
  admin-gated inline — `(app)` is the authed builder route group, not
  `(admin)`); after returning from Stripe onboarding it polls the connect
  status briefly (bounded window, see `PaymentsSettingsView`) instead of going
  silent. The raw-body webhook receiver is
  `app/api/webhooks/stripe/route.ts` (allowlisted in `lib/publicRoutes.ts`).
- `lib/money.ts` — shared cents rounding (`round2`, `residualTargetIndex`).
- `lib/repositories/loginRepo.ts` — credentials lookup and atomic failed-login
  counters; `lib/auth/login.ts` owns lockout policy, called by `authorizeCredentials`.
- `lib/queryCache.ts` — persisted react-query cache policy (localStorage key,
  buster, the persistence allowlist, and the sign-out clear). Consumed by
  `components/ui/Providers.tsx` and `AccountBlock`.
- `lib/repositories/` — all Prisma data access, org-scoped (`*Repo.ts`);
  `userRepo.ts` owns all `User` access (assignable list, archive guard,
  `validateUserIds`, and `applyUserPatch` — the shared role/profile/archived
  orchestration used by both the self-org and super-admin PATCH routes).
- `lib/users/schema.ts` — the shared `userCreateSchema` / `userPatchSchema`
  Zod schemas, used by both the self-org (`app/api/users/`) and super-admin
  (`app/api/admin/orgs/[orgId]/users/`) user create/patch routes.
- `lib/hooks/` — react-query hooks (`useEstimates`, `useInvoices`, …), all
  built on the shared `apiFetch<T>(url, init?, fallbackMessage?)`
  (`lib/hooks/apiFetch.ts`) — fetch + `res.ok` check + `readApiError` +
  `res.json()` (204 → `undefined`) in one place, so every query/mutation
  surfaces the server's real `{code, message}` instead of a fixed generic
  string. New hooks should call it rather than hand-rolling the fetch dance.
  Shared dialog DOM hooks (`useFocusTrap`, `useScrollLock`) live here too.
- `lib/email/` — React-Email templates + Resend senders.
- `lib/tokens.ts` — `isValidTokenShape` (the 43-char base64url shape check for
  `generateToken()` output) and `trackPublicView`, the shared status-gated
  view-tracking spine used by `estimate-review`/`invoice-review`; request
  metadata is read during render, and writes finish via Next's `after()` with
  failure logging. Do not use an untracked fire-and-forget promise here.
- `lib/http/clientMeta.ts` — shared audit metadata extraction for route
  handlers and public review pages; missing/empty values use null.
- `lib/estimateStatus.ts` — canonical status vocabulary, display labels,
  filter values, and the narrower operator-editable status subset.
- `next.config.ts` — global security headers/CSP; preview-only Vercel toolbar
  allowances and `no-referrer` on public bearer-token review pages.
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
- `scripts/ignore-app-deploy.sh` — shared Vercel/CI app-change detection;
  checks both merge parents so a no-op merge from main cannot hide PR changes.

## Gotchas

- **Never squash migrations.** Vercel runs `prisma migrate deploy` at deploy;
  squashing breaks the deploy (and E2E). Add new migrations on top.
- `ADD COLUMN NOT NULL` passes on an empty dev DB but **fails the populated
  Neon PR branch** (existing rows → `23502`). Backfill first, enforce NOT NULL
  in a later migration.
- A fresh worktree may have an **incomplete `node_modules`** (missing
  `@prisma/client` / `pg`) — `next dev`, E2E, and the DB/email vitest suites
  can't run there until you `npm install`.
- **Every public (token-authed) page or API must be allowlisted in
  `lib/publicRoutes.ts`** (consumed by the auth proxy in `proxy.ts`), or
  customers get redirected to `/login`. E2E tests for public pages must
  navigate with a **logged-out** context — a logged-in context masks a missing
  allowlist entry.
- **Record ids are global autoincrement ints, not org-scoped.** Any repo
  function or route that accepts a cross-record FK id (like
  `Event.customerId` / `Event.estimateId`) must validate it against the
  caller's `orgId` before writing, or one org can link to — and then read via
  relation includes — another org's data.
- **The Customer→Location→SiteMeasure→Estimate→Invoice→Payment chain is
  `onDelete: Cascade`.** Delete paths at every level must guard against
  cascading away financial records (`HAS_INVOICES`) and scheduled events
  (`ESTIMATE_HAS_EVENTS`) — don't add a new delete path without those checks.
  The shared guard lives in `lib/repositories/deleteGuards.ts`; customer
  deletion also checks Events linked directly by `customerId`.
- **Stripe test/live modes are isolated.** The Stripe secret key mode must
  match the mode of the stored `stripeConnectAccountId` (an account created
  with a test-mode key cannot be used with a live-mode key and vice versa).
  This invariant holds by construction via the dev/prod DB split — test keys
  in dev, live keys in production. An org onboarded in production must
  re-onboard in any test environment (or seed a fresh test-mode account).
- **React-query persistence is opt-in.** `lib/queryCache.ts` only permits the
  reviewed `line-item-templates` configuration family in localStorage for 24
  hours. New query families default to in-memory only; customer, financial,
  identity, and verification payloads (including nested PII) must not persist.
  Tightening the policy requires a cache-buster bump to evict old stored data.
- **Super-admin routes (`/api/admin/orgs/[orgId]/...`) take the target org
  from the URL param, not the caller's session org** — the `orgId` on the
  gated session belongs to the operator, not the org being managed.
- **QBO refresh tokens rotate (~24h) — never call Intuit's token endpoint
  outside `getFreshAccessContext`** (`lib/repositories/qboRepo.ts`): it
  single-flights the refresh under a row lock; a second concurrent refresh
  would brick the org's connection. Likewise, any NEW invoice/payment
  mutation path must enqueue its QBO sync intent via `enqueueQboTaskTx`
  **inside the same transaction** (see invariant 3 in `CONTEXT.md`).
  Runners also claim a six-minute connection lease before processing and
  release it with a matching timestamp. Never bypass this per-org lease or
  the realm guards on link writes; payment application reads a live balance.
- **QBO e2e specs (`tests/e2e/qbo-*.spec.ts`) need the mock realm**:
  `QBO_ENVIRONMENT=mock` + `QBO_CLIENT_ID/SECRET` + `QBO_TOKEN_ENC_KEY` in
  the target environment (local `.env` or Vercel Preview). They skip
  cleanly when the deployment doesn't serve `/api/qbo-mock/`, so CI stays
  green until the preview env is configured.

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
