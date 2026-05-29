# Organization Onboarding — Design

**Status:** Draft
**Date:** 2026-05-25 (Phase 3 revised 2026-05-28: E2E tenants reuse the
super-admin endpoint; the test-only API and env gate are removed)

## Problem

SqFt has one way to create organizations today: the seed script. Every Org and
its admin user live in `prisma/seed.ts`; there is no signup flow, no billing
integration, and no test-side way for a Playwright spec to stand up its own
tenant. E2E tests share two seeded orgs (`johnson-flooring-demo`,
`other-floors-demo`), which is already producing flakes whenever two tests
mutate org-level state.

Three onboarding paths need to exist:

1. **Public self-serve with a credit card** — anyone can sign up, pay, and use
   the app.
2. **Manual, no-payment, super-admin only** — internal-only path for pilots,
   demos, and special-case customers, gated to a specific email allowlist.
3. **E2E test-created orgs** — every Playwright spec (or worker) can create a
   fresh tenant on demand, isolated from every other test.

All three must produce a tenant that satisfies the same invariants the seed
script enforces today: an Organization row, an admin User, sensible defaults
(unit label, deposit %, validity days, etc.), starting counters
(`nextEstimateNumber`, `nextQuoteNumber`), and a minimum-viable content set
(line-item templates).

## Goals

- One code path creates every tenant; three thin callers gate access.
- Billing state lives on the Organization, queryable by SQL, derived from
  Stripe via webhooks.
- Lapsed billing turns mutations off, never deletes data.
- Manual orgs are first-class — they can be converted to paid later without
  destroying and recreating them.
- E2E tests get isolated tenants. Per-worker by default for speed; per-test on
  opt-in for org-state mutators.
- E2E tenants are created through the existing super-admin endpoint, not a
  test-only API — the super-admin allowlist is the only access gate.

## Non-Goals

- Multiple paid tiers. The marketing site shows Solo $49 / Crew $149; for this
  design we assume one paid product/price. Multi-tier billing is a later
  iteration.
- Email-based admin invites for manual orgs. Super-admin hands credentials off
  out-of-band in this iteration.
- Magic-link login. Signup sets a password directly.
- Admin impersonation, soft-delete, or in-app org editing beyond what already
  exists in `/settings/workspace`.
- Cancellation UX beyond Stripe's hosted Customer Portal.
- Per-org data export on cancellation. (Data is retained read-only;
  reactivation restores access. Hard delete is a manual SQL operation.)

## High-Level Architecture

```
                    ┌─────────────────────────────────┐
                    │  lib/onboarding/                │
                    │    createOrganization(...)      │
                    │  (transactional, single source) │
                    └─────────────────────────────────┘
                              ▲           ▲
                              │           │
        ┌─────────────────────┘           └─────────────────────┐
        │                                                        │
   POST /api/signup                              POST /api/admin/orgs
   (Stripe webhook                               (super-admin allowlist)
    completion)                                   • Phase 2: manual onboarding
        │                                         • Phase 3: E2E test tenants
   Phase 4                                              (same endpoint, reused)
```

Every tenant is created by `createOrganization`. Each entry point applies its
own auth check, but the actual tenant-bootstrap work — schema invariants,
defaults, transaction boundaries — lives in one function with one test suite.
E2E tests deliberately reuse the super-admin `POST /api/admin/orgs` endpoint
rather than a dedicated test-only route (see Phase 3); the only test-specific
caller is the Playwright fixture layer.

## Schema Changes

Single migration that adds five nullable columns on `Organization`. The
existing `plan` column stays put for now to avoid touching unrelated code; we
will retire it once the billing-derived plan is the authoritative source.

```prisma
model Organization {
  // ... existing fields ...

  stripeCustomerId      String?   @unique
  stripeSubscriptionId  String?   @unique
  subscriptionStatus    String    @default("manual")
  // enum-as-string: manual | trialing | active | past_due | unpaid | canceled
  trialEndsAt           DateTime?
  currentPeriodEndsAt   DateTime?
}
```

A new `PendingSignup` model is added in Phase 4. It holds signup-form data
between the Checkout-start and webhook-completion steps, so a tenant only
materializes after Stripe confirms payment intent.

```prisma
model PendingSignup {
  id                       String    @id @default(cuid())
  orgName                  String
  adminName                String
  adminEmail               String
  adminPasswordHash        String    // bcrypt; copied to User.password on webhook
  stripeCheckoutSessionId  String    @unique
  postCompleteToken        String?   @unique  // one-time login token, set on webhook, cleared on /signup/complete
  postCompleteTokenExpiresAt DateTime?
  consumedAt               DateTime?
  expiresAt                DateTime
  createdAt                DateTime  @default(now())
}
```

The password is hashed before insertion (so plaintext never persists). The
webhook copies the hash onto `User.password` via `createOrganization` and
generates a short-lived `postCompleteToken` (random 32 bytes, base64url, 10
min TTL). `/signup/complete` exchanges that token for a session via a
dedicated route (`POST /api/signup/finalize`), which:

1. Verifies the token, expiry, and `consumedAt`.
2. Issues a NextAuth session for the new admin user.
3. Clears the token.

This avoids storing plaintext passwords and avoids a separate magic-link
email round trip while keeping the seamless redirect-to-app experience.

Existing rows in `Organization` get `subscriptionStatus = "manual"` via the
default — the demo seeds become manual orgs automatically.

## The Shared Service: `createOrganization`

Location: `lib/onboarding/createOrganization.ts`.

```ts
type Args = {
  org: { name: string; slug?: string };
  admin: { name: string; email: string; password: string };
  billing:
    | { kind: "manual" }
    | {
        kind: "stripe";
        customerId: string;
        subscriptionId: string;
        status: "trialing" | "active";
        trialEndsAt: Date | null;
        currentPeriodEndsAt: Date;
      };
  seed?: "minimal" | "none";  // default "minimal"
};

type Result = { orgId: string; adminUserId: string; slug: string };

export async function createOrganization(args: Args): Promise<Result>;
```

**Behavior:**

- Runs inside a single Prisma transaction. Any failure rolls back; partial
  tenants never exist.
- If `org.slug` is omitted, slug is derived from `org.name` (kebab-case, ASCII
  only) and a numeric suffix (`-2`, `-3`, …) is appended on collision until
  unique. Up to 20 attempts before throwing.
- Admin email must be globally unique (existing User constraint). Surfaces a
  typed `EmailTakenError` on conflict.
- Hashes the admin password with bcrypt (existing rounds — 10) unless the
  value is already a bcrypt hash (recognized by the `$2[aby]$` prefix), in
  which case it is stored verbatim. This lets the Stripe webhook reuse the
  hash already persisted on `PendingSignup` without re-hashing.
- Sets `subscriptionStatus` from `billing.kind`: `"manual"` for manual,
  status from Stripe for stripe.
- Counters: `nextEstimateNumber = 1`, `nextQuoteNumber = 1`.
- When `seed === "minimal"`, also creates the 6 line-item templates currently
  in `prisma/seed.ts`, via a new shared helper.

**Errors:**

- `EmailTakenError` — admin email already in use.
- `SlugExhaustedError` — 20 collision attempts failed (degenerate case).
- Wraps any other Prisma failure in a generic `OnboardingError` for the
  caller; transaction rolls back.

Tests in `__tests__/lib/onboarding/createOrganization.test.ts`:

- Happy path creates org + admin + templates + correct counters.
- Slug auto-derives, collisions append `-2`, `-3`.
- `EmailTakenError` when email exists.
- Transaction rolls back if a step throws (no org or user persists).
- `billing.kind: "manual"` sets `subscriptionStatus = "manual"` and leaves
  Stripe ids null.
- `billing.kind: "stripe"` populates all Stripe fields verbatim.
- `seed: "none"` skips templates.

## Defaults Helper

`lib/onboarding/defaultOrgContent.ts` exposes:

```ts
export const DEFAULT_LINE_ITEM_TEMPLATES: ReadonlyArray<{
  name: string; description: string; rate: number; unitLabel: string; sortOrder: number;
}> = [...]; // the 6 entries currently inlined in prisma/seed.ts
```

`prisma/seed.ts` and `createOrganization` both consume this constant.
Per AGENTS.md: this counts as a seed-script update tied to a schema-adjacent
change, so the seed gets refactored in Phase 1.

## Paywall Guard

Location: `lib/api/billingGuard.ts` (new), wired into `lib/api/route.ts`.

```ts
// New apiRoute option, default behavior:
// - Mutating verbs (POST/PATCH/DELETE/PUT) are billed-gated by default.
// - GET routes are not gated.
// - Specific routes opt out via { requiresActiveBilling: false }.
//   Opt-outs: /api/billing/*, /api/auth/*, /api/signup, /api/admin/*,
//   /api/test/* (test-mode only).
```

Logic, applied after auth but before the route handler:

- Look up `subscriptionStatus` for the session's `orgId` (one indexed query;
  consider caching on the JWT in a follow-up).
- `manual | trialing | active` → continue.
- `past_due | unpaid | canceled` → return 402 with `{ error: { code:
  "PAYMENT_REQUIRED", message: "Subscription inactive" }}`.

A new error class `PaymentRequiredError` extends `ApiError`. The UI reads the
code via `readApiError` and renders a global "Reactivate billing" banner
above the `(app)` layout.

This guard is wired in Phase 4 (alongside the rest of billing). Phases 1–3
ship with the columns in place but the guard returning "continue" for every
status — manual orgs work indistinguishably from active ones until the guard
is enabled.

## Super-Admin Gate

Location: `lib/auth/superAdmin.ts`.

```ts
const ALLOWED = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED.includes(email.toLowerCase());
}
```

`apiRoute` gains a new option `{ superAdmin: true }`. When set, after the
existing session/auth checks, the route returns 403 `FORBIDDEN` unless
`isSuperAdmin(session.user.email)`. No DB column, no UI management surface —
membership is controlled by editing `.env.prd.local` and redeploying.

The `/admin/orgs` page does the same check server-side in its layout so
non-super-admins get a 403 page instead of a flicker of the UI.

## Phase 1 — Shared Core

User-visible change: none. Library + schema only.

**Deliverables:**

1. Migration `prisma/migrations/<ts>_org_billing_fields/migration.sql` adding
   the five nullable Organization columns above.
2. `lib/onboarding/createOrganization.ts` + Vitest suite.
3. `lib/onboarding/defaultOrgContent.ts` extracted from seed.
4. `prisma/seed.ts` refactor: demo orgs created via `createOrganization({
   billing: { kind: "manual" }})`. Demo-only data (estimates, quotes,
   signatures, calendar events) layered on top of the returned `orgId`.
5. CI passes; no behavior change for current logins.

**Acceptance:**

- `npm run test` (Vitest) green.
- `npm run test:e2e` (Playwright) green against the refactored seed.
- `biome ci .` clean.
- Demo login still works: `demo@sqft.dev` / `demo1234`.

## Phase 2 — Manual Onboarding (Super-Admin)

User-visible change: a new `/admin/orgs` page exists for super-admins. You
can onboard real customer orgs without touching SQL.

**Deliverables:**

1. `lib/auth/superAdmin.ts` + `apiRoute({ superAdmin: true })` option.
2. `app/api/admin/orgs/route.ts`:
   - `GET` — list all orgs with `id, name, slug, subscriptionStatus,
     trialEndsAt, currentPeriodEndsAt, createdAt`, plus user count.
   - `POST` — `{ orgName, adminName, adminEmail, adminPassword }`. Calls
     `createOrganization({ billing: { kind: "manual" }})`. Returns
     `{ orgId, slug, adminEmail }` with status 201.
3. `app/(admin)/layout.tsx` — server-side super-admin check, 403 page on
   miss.
4. `app/(admin)/admin/orgs/page.tsx` — server component:
   - Existing-orgs table: name, status pill (`manual / trialing / active /
     past_due / unpaid / canceled`), created date, user count.
   - Create form: org name, admin name, admin email, temp password (with a
     "suggest" button that generates a strong random one).
   - Success state shows the credentials once with a copy button. No email
     sent — hand-off is out-of-band.
5. Vitest for the routes: super-admin allow, non-super-admin deny, validation
   errors, happy path.
6. Playwright spec for the UI is deferred to Phase 3 (it needs the Phase 3
   Playwright fixtures, which mint isolated tenants via this same endpoint).

**Acceptance:**

- Adding your email to `SUPER_ADMIN_EMAILS` and signing in shows the admin
  page.
- Creating an org through the form yields a working login for the new admin.
- The new org sees zero data from any other org.
- Non-super-admin users get a 403 page (not a flicker, not a redirect loop).
- `biome ci .` clean; all tests green.

## Phase 3 — E2E Test Orgs

User-visible change: none for end-users. The Playwright suite is restructured
so every spec runs against an isolated tenant it creates at runtime, instead
of sharing the two seeded demo orgs. The shared-org flakes (two specs mutating
the same org-level state) disappear.

**Key decision — reuse the super-admin path, no test-only API.** Tenant
creation for E2E goes through the **existing** super-admin endpoint
`POST /api/admin/orgs` (shipped in Phase 2), not a new test-only route. This
collapses most of the original Phase 3 surface:

- **No** `lib/env.ts` / `IS_E2E_TEST_MODE`.
- **No** `app/api/test/orgs/*` routes.
- **No** `next.config.ts` / `instrumentation.ts` startup assertion.
- **No** "three defenses" and **no** `x-test-token` shared secret.

Those existed only to make a *test-only* API safe to expose. Because tenant
creation now flows through the real super-admin API, the security boundary is
the `SUPER_ADMIN_EMAILS` allowlist that already exists — production-grade, and
the same gate operators use. The endpoint is meant to be live in every
environment; access is gated by *who you are authenticated as*, not by an env
flag.

This also sidesteps a trap in the original design: CI runs Playwright against
the **Vercel preview deployment** (`playwright.config.ts` honours `BASE_URL`;
`.github/workflows/pr.yml` waits for the preview and points the suite at it),
not a local dev server. Vercel preview deployments run with
`NODE_ENV=production`, so the original `IS_E2E_TEST_MODE && NODE_ENV ===
"production"` startup assertion would have crashed every preview build. The
super-admin approach has no env gate to trip.

**Configuration (not code):** `SUPER_ADMIN_EMAILS` must include the bootstrap
super-admin `admin@sqft.dev` on the Vercel **Preview** environment and in the
local `.env`. The seed already creates `admin@sqft.dev` / `demo1234` as a
super-admin (`prisma/seed.ts`). Production must not carry these CI
credentials. *(Already configured on Vercel Preview.)*

**No teardown.** Phase 2 ships no org-deletion path and Phase 3 adds none.
Instead, every org the fixtures create uses a **unique** org name and admin
email (`{label}-{workerIndex}-{timestamp}-{rand}` /
`…+{timestamp}-{rand}@playwright.test`), so reruns never collide
(`createOrganization` already auto-suffixes slugs; the unique email satisfies
the global `User.email` constraint). Orgs accumulate within a run in the
ephemeral per-PR Neon preview branch, which is dropped afterward
(`delete-neon-branch.yml`).

**Deliverables:**

1. **Playwright fixtures** in `tests/e2e/fixtures/`:
   - `superAdminContext` (worker-scoped): logs in once as `admin@sqft.dev`,
     holds an authed `APIRequestContext` used only to `POST /api/admin/orgs`.
   - `createOrg(label)` helper: posts a unique `orgName` + `adminEmail` + a
     generated password to the endpoint; returns the credentials. Uniqueness
     gives rerun-safety with no cleanup.
   - `workerOrg` (worker-scoped): one fresh org per worker; logs in as its
     admin once and captures `storageState` to a per-worker file.
   - `authedPage` (existing fixture, rewritten): sources its `storageState`
     from `workerOrg` instead of the demo user. Drop-in for every test that
     uses it today.
   - `freshOrgPage` (new, test-scoped): a brand-new org per test, for
     org-state mutators.
   - `secondaryOrgPage` (new, test-scoped): a second org in the same test,
     for cross-org / tenant-isolation tests.
   - `createTestUser` / `loginAsTestUser` (adapted): `createTestUser` takes an
     authed org-admin context (the fixture's fresh org) instead of hardcoding
     `demo@sqft.dev`, so role/members specs create their lead/crew users
     inside their own org.

   Login stays via the existing `/login` form flow for fidelity. Each org
   creation is a single `createOrganization` call (bcrypt + transaction + 6
   templates), expected well under 500ms against Neon.

2. **Spec migration — all specs.** Every spec moves off the shared demo orgs:
   - `loginAsDemo` → `workerOrg` + `authedPage` (read-mostly specs) or
     `freshOrgPage` (org-state mutators: `org-settings.spec.ts`,
     `members.spec.ts`, `role-crew.spec.ts`, `role-lead.spec.ts`,
     `auth.spec.ts`).
   - `loginAsOtherDemo` → `secondaryOrgPage`.
   - Cross-org 404 tests (e.g. `customers.spec.ts` 10.1.4–10.1.6) use
     `authedPage` + `secondaryOrgPage`.
   - The now-unused `loginAsDemo` / `loginAsOtherDemo` helpers in
     `tests/e2e/fixtures/seed.ts` are removed.

3. **`admin-orgs.spec.ts`** (deferred from Phase 2): super-admin signs in,
   creates a new org via the `/admin/orgs` UI, signs out, signs in as the new
   admin, confirms zero data from any other org.

4. **Seed left intact.** `johnson-flooring-demo` + `demo@sqft.dev` (plus
   `lead@`, `crew@`, `other-floors-demo` / `demo2@`, and the `admin@sqft.dev`
   super-admin) all remain as the manual-exploration fallback. Trimming the
   now-unreferenced demo users/orgs is a trivial follow-up, deliberately not
   bundled here (it would otherwise force the spec migration and the seed
   change to land together).

**Acceptance:**

- Full Playwright suite green against the Vercel preview in CI
  (`workers: 1`) and locally (parallel default workers), with
  `SUPER_ADMIN_EMAILS=admin@sqft.dev` set in the target environment.
- No spec references `demo@sqft.dev`, `demo2@sqft.dev`, or `loginAs*`.
- Fixture org creation completes in <500ms each.
- `npm test` (Vitest) unaffected; `biome ci .` clean.

## Phase 4 — Self-Serve Signup + Stripe

User-visible change: `/signup` exists; marketing-site CTAs link to it; lapsed
orgs see a reactivate banner.

**Deliverables:**

1. **Stripe setup:**
   - One product, one recurring price configured in Stripe (trial period set
     on the price, not in code).
   - Env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`,
     `STRIPE_PUBLISHABLE_KEY` (only the secret + price id are needed
     server-side; publishable key is for any future client work, optional
     for now).
   - `lib/stripe.ts` wraps the SDK and exports a single client.
2. **`PendingSignup` migration** as described in Schema Changes.
3. **`/signup` page** at `app/(auth)/signup/page.tsx`:
   - Zod-validated form: org name, admin name, admin email, password (8+).
   - `POST /api/signup` (no auth required, no billing-guard) creates a
     `PendingSignup` row + a Stripe Checkout Session with `client_reference_id
     = pendingSignup.id`, `customer_email = adminEmail`, `mode:
     "subscription"`, `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1
     }]`. Returns `{ checkoutUrl }`. Client redirects to it.
4. **`/signup/complete` page** at `app/(auth)/signup/complete/page.tsx`:
   - Reads `session_id` query param. Polls `GET
     /api/signup/status?session_id=...` once a second up to 10s.
   - The status endpoint returns either `{ ready: false }` or `{ ready:
     true, postCompleteToken }` once the webhook has consumed the signup.
   - On `ready: true`, the page calls `POST /api/signup/finalize` with the
     token. That route validates the token, issues a NextAuth session for
     the new admin, clears the token, and redirects to `/`.
   - Edge case: if polling times out, displays "Subscription set up — sign
     in at /login in a moment."
5. **Webhook at `/api/stripe/webhook`** (no auth, signature-verified):
   - `checkout.session.completed`: load `PendingSignup` by
     `client_reference_id`. If `consumedAt` is non-null, no-op (replay).
     Otherwise, in a single transaction: (a) call `createOrganization({
     billing: { kind: "stripe", customerId, subscriptionId, status:
     "trialing", trialEndsAt, currentPeriodEndsAt }})`, passing
     `admin.password` as the already-hashed `adminPasswordHash` (the service
     detects an already-bcrypted value and stores as-is); (b) generate a
     random 32-byte base64url `postCompleteToken` with a 10-minute expiry;
     (c) set `consumedAt = now()`, `postCompleteToken`,
     `postCompleteTokenExpiresAt`. Idempotent via
     `Organization.stripeSubscriptionId @unique` — second delivery throws on
     the unique, we catch and no-op.
   - `customer.subscription.updated` / `customer.subscription.deleted`:
     update `subscriptionStatus`, `currentPeriodEndsAt`, `trialEndsAt` on the
     org matched by `stripeSubscriptionId`. Map Stripe statuses 1:1 to our
     enum.
   - `invoice.payment_failed`: no-op. Stripe will retry; the eventual
     `subscription.updated` flips us to `past_due` or `unpaid`.
   - Any other event: log + no-op.
6. **Paywall guard activation**:
   - `lib/api/billingGuard.ts` becomes load-bearing. Wire into `apiRoute` so
     mutating verbs gate on `subscriptionStatus`.
   - Opt-outs: `/api/billing/*`, `/api/auth/*`, `/api/signup*`,
     `/api/admin/*`, `/api/test/*`, `/api/q/*` (public quote-customer flows).
   - UI: `app/(app)/layout.tsx` renders a top banner when the current org's
     `subscriptionStatus` is `past_due | unpaid | canceled`, linking to
     `/settings/billing`.
7. **`/settings/billing` page**:
   - Paid org (manual=false): status, next renewal date, "Manage billing"
     button → server action creates a Stripe Customer Portal session and
     redirects.
   - Manual org: "Free internal plan — add a card to convert" button →
     server action creates a Checkout Session with this org's `orgId` in
     `client_reference_id`. A new webhook code path detects "Checkout for an
     existing manual org" (presence of `orgId` rather than a
     `pendingSignupId` reference) and attaches the resulting customer +
     subscription to the existing org.
   - Cancellation, card updates, invoices: all delegated to the Portal.
8. **Marketing site update**: `www/pricing.html` "Start free trial" buttons
   point to `/signup`. (Open question: is `www/` served from the same domain
   as the app? If not, the link becomes the absolute app URL. Flagging — I
   will write the spec assuming same-origin and treat divergence as an inline
   fix during implementation.)
9. **Tests:**
   - Vitest: webhook signature verification, idempotency on duplicate
     `checkout.session.completed`, status mapping for every Stripe status,
     paywall behavior for each status, opt-out routes ignore paywall.
   - Playwright: `/signup` form validates; submitting without Stripe-test
     keys is skipped. Live Stripe Checkout flow remains a manual smoke test.

**Acceptance:**

- New user signs up on `/signup`, completes Checkout (test card), lands on
  `/` logged in.
- `subscriptionStatus = "trialing"`, trial end date populated.
- Cancelling via Customer Portal flips status to `canceled` within seconds.
- A canceled org logs in but can't mutate — sees the reactivate banner.
- A manual org can convert by adding a card via `/settings/billing`.
- `biome ci .` clean; all tests green.

## Failure Modes & Mitigations

| Failure | Mitigation |
| --- | --- |
| Webhook delivered before `PendingSignup` row visible (race) | Webhook handler retries the lookup with short backoff (3 × 200ms) before failing. Stripe will redeliver on 5xx. |
| Two webhook deliveries for the same `checkout.session.completed` | `Organization.stripeSubscriptionId @unique` catches the second. Handler catches Prisma `P2002`, no-ops, returns 200. |
| E2E tenant-creation endpoint reachable in production | No test-only endpoint exists. E2E reuses `POST /api/admin/orgs`, gated by the `SUPER_ADMIN_EMAILS` allowlist. Production simply does not carry CI super-admin credentials. |
| Slug collisions during high-volume signup | 20-attempt retry loop with numeric suffix; throws `SlugExhaustedError` (effectively impossible). |
| Manual org admin forgets their password | Phase 2: super-admin creates a new manual org with the same email isn't possible (email is unique). Workaround until a password-reset flow ships: super-admin updates the User row directly via the admin UI in a follow-up, or manually via SQL. Not in scope for this design. |
| Stripe outage during signup | Checkout creation fails → user sees error on `/signup`, retries. No partial state because no org is created before the webhook. |
| Lapsed customer wants their data back after months | Data is retained read-only forever. They reactivate via Customer Portal; webhook flips status to `active`; mutations resume. |
| E2E test orgs accumulate | No teardown by design. Fixtures use unique org names + admin emails per run, so reruns never collide. Orgs live in the ephemeral per-PR Neon preview branch, dropped afterward (`delete-neon-branch.yml`). |

## Open Questions

- Should the marketing site's "Start free trial" CTA link to `/signup` on the
  app domain, or live on `www/` and redirect? Assumed same-origin for now;
  trivially flippable during implementation.
- Future password-reset flow for manual-org admins. Deliberately out of scope
  here, but worth flagging.

## Roll-out Order

1. **Phase 1** — Schema migration + `createOrganization` service + seed
   refactor. No user-visible change. Easiest to validate via existing tests.
2. **Phase 2** — Super-admin allowlist + `/admin/orgs` UI. You can onboard
   real customer orgs immediately. Vitest covers route logic; Playwright spec
   deferred to Phase 3.
3. **Phase 3** — Playwright fixtures that mint isolated tenants via the
   existing super-admin `POST /api/admin/orgs` endpoint + full spec migration
   off the shared demo orgs. No new API, no env gate. Unblocks the admin-UI
   Playwright spec.
4. **Phase 4** — Stripe Checkout + webhook + `/signup` + paywall +
   `/settings/billing`. Most external-dependency-heavy; everything else is
   battle-tested by the time this lands.
