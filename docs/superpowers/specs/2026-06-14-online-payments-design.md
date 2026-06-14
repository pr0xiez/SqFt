# Online Payments (Stripe) — Design

**Date:** 2026-06-14
**Status:** Approved (design); pending implementation plan

## Summary

Let a contractor's customer **pay an invoice online** from the public
`/invoice-review/[token]` page, with the payment **auto-recorded into the
existing `Payment` ledger** by a Stripe webhook. This closes the
estimate → invoice → **payment** loop that today dead-ends at "record payment
manually" — the difference between software that *tracks* money and software
that *moves* it.

Money is collected through **Stripe Connect (Express)**: each org onboards a
connected account once (admin-gated, in Settings → Workspace → Payments) and
receives funds directly. Customers pay via a **server-created, Stripe-hosted
Checkout Session** (no embedded Stripe.js), supporting **cards and ACH
(`us_bank_account`)**. Charges are **destination charges on the platform
account** (`transfer_data.destination` + `on_behalf_of`), so the contractor is
the merchant of record (their name on the customer's statement) while SqFt owns
a single charge → single ledger row → single webhook endpoint.

This is the **phase 2** the invoicing design
([2026-06-05-invoicing-design.md](2026-06-05-invoicing-design.md)) explicitly
left as a seam: `Invoice.stripePaymentLinkUrl` / `stripePaymentIntentId`,
`Payment.method = 'stripe'|'ach'` / `stripeChargeId`, and
`Organization.stripeConnectAccountId` already exist. **Deposit-collected-at-
estimate-approval is out of scope** and becomes its own later spec.

## Decisions (locked)

| Question | Decision |
|---|---|
| Scope this round | **Invoice payments only** — Connect onboarding + pay-online + webhook→ledger. Deposit-at-approval deferred to its own spec. |
| Connect account type | **Express** (controller-based), one connected account per org on `Organization.stripeConnectAccountId`. |
| Checkout surface | **Stripe-hosted Checkout Session**, server-created, redirect. No client-side Stripe.js / Payment Element. |
| Payment methods | **Cards + ACH** (`card`, `us_bank_account`). |
| Charge model | **Destination charges on the platform account** with `transfer_data.destination` + `on_behalf_of = <org account>`. No `Stripe-Account` header. |
| Platform/application fee | **None this round** (`application_fee_amount` omitted). Destination model supports turning it on later with no rework. |
| Pay URL source | **On-demand public route** builds a fresh session for the live balance each click. The frozen snapshot is **not** used to store a (stale) pay URL. |
| Pay amount | **Full live balance due** (`amount − settled payments`). No customer-entered partial amounts. |
| In-flight ACH | **Event marker + banner.** An unsettled ACH writes **no `Payment` row** — only an `ach_processing` `InvoiceEvent`. Ledger means *settled money only*; `nextInvoiceStatus` is unchanged. |
| Refunds / disputes | **Log-only** to the audit trail this round; no automatic ledger/transfer reversal. |
| Customer receipt | **Stripe's hosted Checkout receipt** + a "payment received — processing" banner on return. No SqFt-branded receipt email this round. |
| Gating | Onboarding/status routes are **admin-only**; the public **Pay button is gated on the mirrored `stripeChargesEnabled`** flag. |
| Webhook truth | The **webhook is the sole source of truth** for recording money. The Checkout `return_url` is UI-only and never marks anything paid. |

## Architecture

Three surfaces, one ledger:

1. **Onboarding** (admin) — *Settings → Workspace → Payments*. Admin clicks
   *Connect Stripe* → we create an Express connected account for the org →
   redirect to Stripe-hosted KYC. Completion is learned **only** from the
   `account.updated` webhook, which mirrors `charges_enabled` /
   `payouts_enabled` / `details_submitted` onto new `Organization` columns.
   Those flags gate everything downstream.
2. **Pay** (public, no session) — the existing *"Pay invoice"* button on
   `/invoice-review/[token]` points at a new allowlisted route that, on click,
   recomputes the **live balance**, builds a fresh destination Checkout Session
   (card + ACH), stamps `Invoice.stripePaymentIntentId`, and 303-redirects the
   customer to Stripe.
3. **Webhook → ledger** — `POST /api/stripe/webhook` verifies the Stripe
   signature on the raw body and records **settled** payments into the existing
   `Payment` ledger via a new `recordStripePayment` seam.

### Charge model — destination charges with `on_behalf_of`

All Stripe objects (Checkout Session, PaymentIntent, Charge) are created on
**SqFt's platform account** (platform secret key, **no** `Stripe-Account`
header) and routed to the org via:

```
payment_intent_data: {
  transfer_data: { destination: org.stripeConnectAccountId },
  on_behalf_of:  org.stripeConnectAccountId,
  metadata:      { invoiceId, orgId },
}
metadata: { invoiceId, orgId }   // also on the session
```

Why destination over direct charges:

- **One webhook endpoint, one signing secret.** Every payment event lands on a
  single platform endpoint (`connect=false`, no top-level `account` field),
  matching the repo's one-allowlisted-route / one-secret discipline. Direct
  charges fan webhooks out across N connected accounts, each event
  `Stripe-Account`-scoped for reads.
- **Contractor-branded.** `on_behalf_of` makes the contractor the merchant /
  settlement of record, so **their** business name + statement descriptor
  appear on the customer's card/bank statement, while SqFt still owns one
  `Charge` = one idempotency key = one ledger row.
- **Future platform fee is a one-liner.** `application_fee_amount` is natively
  supported; we ship it at **0** today.

Accepted trade-off (out of scope this round, flagged): in this model SqFt's
**platform balance is debited first** on refunds and disputes and recovers via
transfer reversal. We set `controller.losses.payments = 'application'` at
account creation so the liability is explicit and intentional. Operational
negative-balance / reversal handling is a follow-up spec.

## Data model

The payment plumbing already exists from the invoicing phase and needs **no
migration**:

- `Invoice.stripePaymentLinkUrl`, `Invoice.stripePaymentIntentId @unique`
- `Payment.method` (accepts `card` / `ach` / `stripe`), `Payment.stripeChargeId @unique`
- `Payment.recordedByEmail` / `recordedByName` are **already `String?`
  (nullable)** — the no-human-recorder path needs only a **TypeScript** change
  to `RecordPaymentInput` (make them optional), **not** a DB migration.
- `Organization.stripeConnectAccountId`

### Migration 1 — Organization onboarding-status mirror (the only migration)

Additive, all defaulted/nullable → safe on the populated Neon PR branch (the
`23502` failure mode only bites `ADD COLUMN NOT NULL` *without* a default; a
`NOT NULL DEFAULT` backfills existing rows in place).

```prisma
// Organization — mirrored from Stripe via the account.updated webhook;
// system-managed, never client-settable.
  stripeChargesEnabled   Boolean @default(false)
  stripePayoutsEnabled   Boolean @default(false)
  stripeDetailsSubmitted Boolean @default(false)
  stripeOnboardingStatus String  @default("none") // none | pending | action_needed | enabled
  stripeRequirementsDue  Json?   // currently_due / past_due for the re-onboarding banner
  stripeDisabledReason   String?
```

New migration folder on top of the existing chain (e.g.
`20260615000000_org_connect_status`) — **never squash** (Vercel runs
`prisma migrate deploy`). `prisma/seed.ts` sets the new defaults explicitly
(seeded orgs stay un-onboarded so the dev Pay button is correctly hidden;
optionally seed one fully-enabled org behind a flag for local UI work).

> **No `Payment.status` column.** The locked ACH decision (event-marker +
> banner) keeps the ledger meaning *settled money only*, so the "visible
> processing chip" migration is **not** built.

## `lib/stripe/` — new module (port / seam)

Built behind a `StripeGateway` **port**, mirroring `runSendPipeline`'s
Sendable seam, so checkout-building, webhook-interpretation, and
ledger-recording are unit-testable with **no Stripe network and no DB**.

| File | Purpose |
|---|---|
| `lib/stripe/client.ts` | Lazy server-only singleton (mirrors `lib/email/client.ts`): `getStripeClient()` reads `STRIPE_SECRET_KEY`, pins a fixed `apiVersion`, **returns `null` when the key is unset** so module-load never instantiates (CI / worktrees stay green). |
| `lib/stripe/gateway.ts` | The `StripeGateway` interface: `createOnboardingAccount`, `createAccountLink`, `getAccountStatus`, `createCheckoutSession`, `constructWebhookEvent`, `retrievePaymentIntent`. Routes import the port, not the SDK. |
| `lib/stripe/realGateway.ts` | Production implementation backed by `getStripeClient()`; the only file touching the SDK surface for these calls. |
| `lib/stripe/fakeGateway.ts` | In-memory implementation (records calls, returns canned objects) for unit tests. |
| `lib/stripe/checkout.ts` | **Pure** builder: live-balance cents + invoice/org ids + return URLs → destination Checkout Session params. Unit-testable in isolation. |
| `lib/stripe/webhookHandler.ts` | Event-dispatch brain: maps `event.type` → action per the table below, resolves + org-validates, calls `recordStripePayment` or logs a marker. No raw-body/signature concerns. |
| `lib/stripe/onboarding.ts` | `ensureConnectAccount(orgId)` (create-if-null + persist id + `metadata.orgId`), `buildAccountLink`, `mirrorAccountStatus(account)` — shared by the status route and the `account.updated` webhook branch. |

## Onboarding flow (admin)

1. **One-time setup:** `npm install stripe`; add `lib/stripe/client.ts`; add env
   vars; register **one** platform webhook endpoint (`connect=false`) at
   `/api/stripe/webhook` (also receiving connected-account `account.updated`).
2. Admin opens *Settings → Workspace → Payments* (`PaymentsSection`,
   admin-gated). If not connected, shows a **Connect Stripe** button.
3. Click → client POSTs `/api/org/stripe-connect/onboarding`. Server: if
   `stripeConnectAccountId` is null, `accounts.create` with
   `controller={ stripe_dashboard:{type:'express'}, fees:{payer:'application'},
   losses:{payments:'application'}, requirement_collection:'stripe' }`,
   `capabilities={ card_payments:{requested:true}, transfers:{requested:true} }`,
   `metadata:{ orgId }`.
4. **Persist `account.id` to `Organization.stripeConnectAccountId` immediately
   (before any redirect)** and set `stripeOnboardingStatus='pending'` — so a
   crash mid-flow can't orphan a Stripe account the webhook can't map.
5. Server mints `account_links.create({ type:'account_onboarding',
   refresh_url:/api/org/stripe-connect/refresh,
   return_url:/settings/workspace?stripe=return })` and returns `{url}`; client
   does `window.location = url`.
6. Contractor completes Stripe-hosted KYC. Expired single-use links bounce to
   `refresh_url`, which re-mints and 303s to a fresh link.
7. On `return_url` the UI shows "Checking status…" and polls
   `/api/org/stripe-connect/status`. **The return is neutral** — never used to
   flip the org to enabled.
8. **Completion is learned only from `account.updated`**, which mirrors
   `charges_enabled` → `stripeChargesEnabled`, `payouts_enabled`,
   `details_submitted`, `requirements` → `stripeRequirementsDue` /
   `stripeDisabledReason`, and recomputes `stripeOnboardingStatus` (`enabled`
   when `charges_enabled`; `action_needed` when requirements are due or a
   disabled reason is set).
9. The public Pay route + Checkout creation are **gated on
   `stripeChargesEnabled`** (and a present account id). Until then the public
   page shows **no Pay button** and falls back to the existing
   `paymentInstructions` text.
10. **Re-onboarding:** a later `account.updated` showing currently/past-due
    requirements → `stripeOnboardingStatus='action_needed'`; `PaymentsSection`
    surfaces a *Finish setup* banner that mints a fresh link.

## Pay flow (public)

`GET /api/invoice-review/[token]/pay` (the target of `Invoice.payUrl`):

1. Look up the invoice by `publicToken`.
2. Guard: org `stripeChargesEnabled` true (else `STRIPE_NOT_CONNECTED`); live
   balance `> 0` and status not `paid`/`void` (else `INVOICE_ALREADY_PAID`).
3. Recompute the **live balance due in cents** (`amount − Σ settled payments`).
4. `createCheckoutSession` (destination model, `card` + `us_bank_account`,
   `unit_amount` = live balance cents, `metadata.invoiceId` on session **and**
   `payment_intent_data`, `us_bank_account.verification_method='instant'`,
   `receipt_email`, success/cancel URLs to `/invoice-review/[token]?paid=1`).
5. Stamp `Invoice.stripePaymentIntentId`.
6. **303-redirect** the browser to `session.url`.

One hop, always-current amount, no snapshot mutation, no Stripe call on page
load.

## Webhook → ledger

`POST /api/stripe/webhook` is a **bare Next.js route handler** — deliberately
**not** wrapped in `apiRoute` / `publicRoute`, which eagerly consume the body.
It reads the raw bytes (`req.text()`), verifies the signature with
`constructWebhookEvent(sig, STRIPE_WEBHOOK_SECRET)` **before any JSON parse**,
then dispatches to `webhookHandler`. Allowlisted in `lib/publicRoutes.ts` (the
signature is the credential). Returns `200` on success and on idempotent
replays; `400` on a bad signature (so Stripe stops retrying a malformed body).

The recording rule unifies cards and ACH: **write a `Payment` row only for
settled money.**

| Event | Action | Idempotency |
|---|---|---|
| `checkout.session.completed` (`payment_status=paid`) | **Card success** (instant). Record `Payment(method='card')` for the PaymentIntent's `latest_charge`. | `Payment.stripeChargeId @unique`; P2002 ⇒ already recorded ⇒ 200. |
| `checkout.session.completed` (`payment_status=unpaid`) | **ACH submitted, not settled.** No `Payment` row. Log `InvoiceEvent(type='ach_processing', source='customer')`. Balance unchanged. | No ledger write (dedupe log on `event.id`). |
| `checkout.session.async_payment_succeeded` | **ACH settled.** Record `Payment(method='ach')` keyed on charge id. | `Payment.stripeChargeId @unique`. |
| `payment_intent.succeeded` | Terminal success (card or ACH) — redundant safety net for the two above. Record-once on charge id. | `stripeChargeId @unique` (secondary: `Invoice.stripePaymentIntentId @unique`). |
| `payment_intent.processing` | ACH in-flight. No ledger write; optionally ensure the `ach_processing` marker. | Idempotent by construction. |
| `checkout.session.async_payment_failed` / `payment_intent.payment_failed` / `charge.failed` | ACH bounced / card declined. No record. Log `InvoiceEvent(type='ach_failed'\|'payment_failed', source='system')`. Balance untouched. | No ledger write. |
| `account.updated` (connected account) | Onboarding/status change. Resolve org by `stripeConnectAccountId` (or `metadata.orgId`), org-validate, mirror flags + recompute `stripeOnboardingStatus`. | Compare-and-set; replays + out-of-order converge. |
| `charge.dispute.created` / `charge.refunded` | **Out of scope** for the ledger this round. Log an `InvoiceEvent` for audit/operator visibility; flag for the refunds spec. | Dedupe log on `event.id`; no ledger mutation. |

### `recordStripePayment` seam

New function in `lib/repositories/invoiceRepo.ts`, mirroring `recordPayment`'s
transaction exactly but for the no-human path:

```
recordStripePayment(invoiceId, orgId, {
  amount, method: 'card' | 'ach', stripeChargeId, stripePaymentIntentId, paidAt
})
```

- **Idempotency:** the tx first does
  `tx.payment.findUnique({ where:{ stripeChargeId } })` → if present, it's a
  replay → return the current invoice (200), no second row. If absent, create
  the `Payment`; `Payment.stripeChargeId @unique` is the hard backstop — a
  concurrent duplicate that slips past the read throws Prisma **P2002**, caught
  and treated as already-recorded.
- **No human recorder:** pass `recordedByEmail: null`, `recordedByName: 'Stripe'`
  (non-human sentinel). The `InvoiceEvent` uses `type='payment_recorded'`,
  `source='system'`, `metadata:{ amount, method, stripeChargeId,
  stripePaymentIntentId, stripeEventId }` — distinguishing a Stripe-driven
  record from a builder-entered one.
- **Status recompute reuses `nextInvoiceStatus` unchanged.** Because we only
  ever write a row for *settled* money, an in-flight ACH contributes **zero** to
  `paid`, so an invoice can never flip to `paid` on unsettled funds. After
  create, sum payments → `nextInvoiceStatus` → stamp `paidAt` iff
  `status === 'paid'` — byte-for-byte the `recordPayment` behavior.
- **Org-scope (cross-record FK guard):** the handler resolves `orgId` from the
  PaymentIntent's `transfer_data.destination`, loads the invoice by
  `metadata.invoiceId`, and asserts `invoice.orgId === resolvedOrgId` **and**
  `org.stripeConnectAccountId === destination` before writing (honoring the
  "record ids are global ints, org-validate every cross-record FK" gotcha). A
  mismatch ⇒ `STRIPE_ORG_MISMATCH`: logged, **200** to Stripe (stop retrying),
  never written to the ledger.

## API routes

Org-scoped (`apiRoute`, `minRole:'admin'`):

- `POST /api/org/stripe-connect/onboarding` — ensure account (persist id +
  `metadata.orgId` before redirect), mint `account_onboarding` link, return
  `{url}`.
- `GET /api/org/stripe-connect/refresh` — `account_links` `refresh_url` target;
  re-mint a fresh link and 303.
- `GET /api/org/stripe-connect/status` — return mirrored
  `{ chargesEnabled, payoutsEnabled, detailsSubmitted, onboardingStatus,
  disabledReason, requirementsDue }` for the settings UI to poll on return.

Public:

- `GET /api/invoice-review/[token]/pay` — `publicRoute`, allowlisted. Token →
  invoice, build live-balance destination session, stamp
  `stripePaymentIntentId`, 303 to Stripe. **What `Invoice.payUrl` points at.**
- `POST /api/stripe/webhook` — **bare handler** (raw-body signature verify),
  allowlisted. Dispatch the event table above.

Unchanged:

- `PATCH /api/org` — **not** extended for Stripe. `stripeConnectAccountId` and
  the new mirror columns are system/webhook-managed and never client-settable;
  the strict org `PatchBody` Zod schema stays closed (defense against a client
  forging `chargesEnabled`).

## API error codes

New `ApiError` subclasses in `lib/api/errors.ts` (documented in `CONTEXT.md`):

| Code | HTTP | When |
|---|---|---|
| `STRIPE_NOT_CONNECTED` | 409 | Pay route / session creation for an org with no `stripeConnectAccountId` or `stripeChargesEnabled=false`. (The public page hides the button; the route still guards.) |
| `STRIPE_ONBOARDING_FAILED` | 502 | `accounts.create` / `account_links.create` fails upstream. Mirrors `EMAIL_FAILED`'s external-service shape. |
| `INVOICE_ALREADY_PAID` | 409 | Pay route invoked when live balance ≤ 0 or status `paid`/`void` — nothing to charge. |
| `STRIPE_WEBHOOK_SIGNATURE_FAILED` | 400 | `constructWebhookEvent` rejects the signature in the bare route. Returned as a plain 400 (the bare route doesn't use the envelope), code logged for parity. |
| `STRIPE_ORG_MISMATCH` | 422 | Webhook resolves a PaymentIntent whose `destination` / `metadata.invoiceId` don't agree on one org. Logged + 200-to-Stripe; never writes the ledger. |

## Public page UX — `app/invoice-review/[token]/page.tsx`

- **Pay button** (already in `PublicInvoiceView`): rendered only when the org is
  charges-enabled and a balance is owed; `payUrl` →
  `/api/invoice-review/[token]/pay`. Otherwise the existing
  `paymentInstructions` text stands in.
- **Processing banner** (event-marker driven — the page already loads
  `invoiceEvents`):
  - *Immediately after paying* — `return_url` `?paid=1` → "Payment received —
    processing" (purely from the query param).
  - *On any later visit* — if the most recent relevant event is `ach_processing`
    with no later `payment_recorded` / `ach_failed`, show a persistent "A bank
    payment is processing (1–4 business days)" note. When the settlement webhook
    writes the real `Payment` row, the live balance drops and the banner clears
    on next load.
- **Receipt:** Stripe's hosted Checkout receipt (`receipt_email`); no
  SqFt-branded email this round.

## Settings UI — `components/settings/workspace/PaymentsSection.tsx`

Admin-only section in workspace settings, mirroring `IdentitySection` /
`DefaultsSection`: a Connect status badge + **Connect / Manage** button (POSTs
onboarding → `window.location = url`), or a **Finish setup** banner when
requirements are due. It's a **read-only mirror** of status (not part of the
SaveBar dirty diff), polling `/api/org/stripe-connect/status` on return.

## Env / config

- `STRIPE_SECRET_KEY` — `sk_test_…` / `sk_live_…`; the **only** API key needed
  (all calls server-side; destination model needs no `Stripe-Account` header).
- `STRIPE_WEBHOOK_SECRET` — `whsec_…` for the single platform endpoint. **Build
  note:** confirm whether one endpoint can carry both payment events and
  connected-account `account.updated`; if Stripe requires a separate
  `connect=true` secret, add `STRIPE_CONNECT_WEBHOOK_SECRET` and have the bare
  route try-verify against both (accept on first match).
- **No `STRIPE_PUBLISHABLE_KEY`** — there is no client-side Stripe.js in this
  hosted-redirect design; don't add a public key.
- Reuse the existing base-URL helper (`lib/baseUrl.ts`) for success/cancel and
  onboarding return/refresh URLs — no new var.
- Add all of the above as placeholders to `.env.example` (matching the
  `RESEND_API_KEY` / `EMAIL_FROM` pattern); real values live in Vercel secrets.

## Security & correctness invariants

- **Raw body before parse.** The webhook route must read raw bytes and verify
  the signature before any JSON parse; wrapping it in `apiRoute`/`publicRoute`
  (which call `req.json()`) would consume the stream and break verification.
  *The single most important implementation constraint.*
- **Webhook is the only source of truth.** `return_url` is UI-only; it never
  marks an invoice paid.
- **`on_behalf_of` is non-optional** in the checkout builder — without it the
  customer's statement shows SqFt's name, not the contractor's.
- **Idempotency is load-bearing.** The same settled payment can arrive via
  `async_payment_succeeded` **and** `payment_intent.succeeded` **and** Stripe's
  3-day retries. `stripeChargeId @unique` + find-first-then-skip + P2002 catch
  are *all* required.
- **Amount drift.** The session amount is captured at click time from the live
  ledger; the webhook re-validates org/amount before recording, and
  `nextInvoiceStatus` clamps the final status (an overpay still reads `paid`).

## Out of scope (clean later increments behind these seams)

- Deposit-collected-at-estimate-approval.
- Customer-entered partial amounts.
- SqFt-branded "payment received" receipt email.
- Automatic refund / dispute reversal (platform-balance / transfer-reversal
  handling) — only **logged** this round.
- Saved payment methods (`setup_future_usage`), non-USD / cross-region orgs, and
  any platform fee `> 0`.

## Build sequence (vertical slices)

0. **Plumbing, no behavior** — `npm install stripe`; `lib/stripe/client.ts`
   (lazy null-safe singleton); env placeholders in `.env.example`; the 5 error
   codes in `lib/api/errors.ts`; document in `CONTEXT.md`. Lint + typecheck
   green.
1. **The seam, fully unit-tested before any route** — `gateway.ts` +
   `realGateway.ts` + `fakeGateway.ts`; `checkout.ts` (pure builder) + its unit
   test. No DB, no network — proves the destination-charge shape in isolation.
2. **No-human ledger write** — relax `RecordPaymentInput` (recorder fields
   optional — *no migration*, columns already nullable) and add
   `recordStripePayment` with `stripeChargeId` idempotency + P2002 catch,
   reusing `nextInvoiceStatus`. Unit + DB-gated integration tests
   (`partial → paid`, replay-no-double-record).
3. **Onboarding (end-to-end, UI-light)** — Migration 1 (Organization mirror
   columns); update `seed.ts`; `lib/stripe/onboarding.ts`; the three
   `/api/org/stripe-connect/*` routes (admin); `PaymentsSection`. Admin can
   connect + see status; no customer can pay yet.
4. **Public Pay path (first customer-visible slice)** —
   `/api/invoice-review/[token]/pay` (allowlisted) building a live-balance
   destination session + 303; set `Invoice.payUrl` (gated on
   `stripeChargesEnabled`). Logged-out E2E: onboarded org shows the button,
   un-onboarded hides it.
5. **Webhook → ledger (the money spine)** — bare `/api/stripe/webhook`
   (raw-body verify, allowlisted) + `webhookHandler.ts` dispatching the full
   event table (card record, ACH processing-vs-settled, failures,
   `account.updated` mirror, org-validation). Unit tests per event row incl.
   double-delivery idempotency; logged-out E2E posts a (fake-signed) event and
   asserts the live balance drops + a `payment_recorded` `InvoiceEvent` exists.
6. **Hardening + UX** — `?paid=1` processing banner; `ach_processing` /
   `ach_failed` visibility; re-onboarding banner from
   `requirementsDue` / `disabledReason`; dispute/refund events logged
   (no ledger mutation).

**Final:** `biome ci .`, `npm run typecheck`, `npm test`, and `--workers=1`
E2E all green; update `CONTEXT.md` (new error codes, the `recordStripePayment`
seam, the ACH settled-only rule) and `AGENTS.md` (new `lib/stripe` module, the
two new public-route allowlist entries) **in the same change**.

## Testing (per AGENTS.md)

- **Unit (no DB / network):** `checkout.ts` params; `webhookHandler` driven
  through every event-table row with `fakeGateway` (incl. same-charge-twice
  idempotency, mirroring `__tests__/lib/send/pipeline.test.ts` ordering style);
  `recordStripePayment` (recorder null/`'Stripe'`, replay returns existing,
  P2002 caught, status recompute); `mirrorAccountStatus` (idempotent
  compare-and-set, out-of-order convergence).
- **Integration (`describe.skipIf(!VITEST_DB_AVAILABLE)`):** `recordStripePayment`
  against a seeded sent invoice flips `sent → partial → paid`; replayed charge
  id doesn't double-record; org-mismatch rejected.
- **E2E (Playwright, `--workers=1`, logged-out context):** seeded onboarded org
  + sent invoice shows the Pay button; a posted signed event drops the live
  balance + writes a `payment_recorded` event; un-onboarded org hides the
  button; invalid webhook signature → 400, no ledger touch. (Logged-out is
  required — a logged-in context masks a missing allowlist entry for the pay /
  webhook routes.)
- Stripe is **never** hit live in CI: the `StripeGateway` port is the seam;
  `realGateway` is exercised only behind manual sandbox runs with
  `stripe listen` / `stripe trigger`.
- **Worktree note:** a fresh worktree may lack `@prisma/client` / `pg` and now
  `stripe` — `npm install` before `next dev` / E2E / DB suites.
  `getStripeClient()` returning null without the key keeps typecheck/boot green.
