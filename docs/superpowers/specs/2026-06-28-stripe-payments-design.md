# Stripe payments for SqFt — design

**Status:** approved design, pre-implementation
**Date:** 2026-06-28
**Author:** brainstormed with the user

## Goal

Let each contractor organization collect online card payments from its
homeowner customers against SqFt invoices. Money settles into the
contractor's own bank account. SqFt takes **no** per-transaction cut. The
**card processing fee is borne by the contractor** (deducted from their payout),
not passed to the homeowner.

## Decisions (locked)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Platform model | **Stripe Connect**, each org = one connected account | Money must land in each contractor's own bank account |
| Account API | **Accounts v2** (`/v2/core/accounts`) | Required; never legacy `type: express/custom/standard` |
| Charge pattern | **Direct charges** | Contractor is merchant of record (independent business, owns the customer) |
| Dashboard | `dashboard: "full"` | SaaS-with-payments pattern; contractors run their own business |
| Fees collector | `fees_collector: "stripe"` | Stripe bills the connected account directly → **contractor eats the processing fee** |
| Losses collector | `losses_collector: "stripe"` | Stripe owns negative-balance liability (required/allowed with direct charges) |
| Platform fee | **None** — no `application_fee_amount` | SqFt takes $0 per transaction; monetized via subscription separately |
| Who pays the card fee | **The contractor**, auto-deducted from payout | Default behavior of direct charges + `fees_collector: stripe`; no surcharge |
| Payment UI | **Stripe-hosted Checkout** (redirect) | Lowest PCI burden, fastest, SCA + wallets handled, mobile-friendly |
| Onboarding | **Account links** (hosted) for v1 | Embedded Connect.js components are a clean follow-up |

**Validated** against Stripe's `connect-recommend` decision matrix and the
`stripe_implementation_planner` (browser, one-time, hosted Checkout leaf).

## Why the contractor-eats-the-fee model is (almost) free

With **direct charges + `fees_collector: "stripe"`**, Stripe automatically
deducts its processing fee from the connected account's balance. The homeowner
pays the **exact invoice balance**; the contractor nets `balance − fee`. There
is **no surcharge**, so:

- No gross-up math, no "processing fee" Checkout line item.
- No surcharging-compliance exposure (US state laws / card-brand caps /
  debit-card surcharge prohibition all become moot).
- `Payment.amount` in our ledger = the full balance the homeowner paid → the
  invoice reads fully paid and **all existing billing math is untouched**.

The one small addition: we capture Stripe's **fee and net amounts** on each
`Payment` (read from the charge's balance transaction) purely so contractors can
see "Paid $X · Stripe fee $Y · You netted $Z" inside SqFt, not only in their
Stripe dashboard.

## Connected-account configuration

Create via `POST /v2/core/accounts` with:

- `dashboard: "full"`
- `configuration.merchant` requesting the `card_payments` capability
- `defaults.responsibilities.fees_collector: "stripe"`
- `defaults.responsibilities.losses_collector: "stripe"`

**Capability gate before charging:** require
`configuration.merchant.capabilities.card_payments.status === "active"`.
Never use the deprecated v1 `charges_enabled` / `payouts_enabled` fields.

## Payment flow

```
Homeowner            SqFt (platform)               Stripe              Contractor
  │ open /invoice-review/[token]                     │                 (connected acct)
  │ ─"Pay now"─▶ POST /api/invoice-review/[token]/checkout              │
  │              create Checkout Session ────────────▶ (on connected acct, direct charge)
  │ ◀─redirect── session.url                          │                 │
  │ ───────── pays on Stripe-hosted page ────────────▶ │ ─ funds (−fee)─▶ │
  │ ◀─ redirect to success_url (?session_id=…)        │                 │
  │              webhook checkout.session.completed ◀─ │                 │
  │              recordStripePayment() → ledger, status→paid             │
```

1. **"Pay now"** → `POST /api/invoice-review/[token]/checkout`
   (`publicRoute`, token-authed, allowlisted). Guards:
   - org has a connected account with `card_payments` **active**
     (`STRIPE_NOT_CONNECTED` / `STRIPE_ACCOUNT_RESTRICTED` otherwise),
   - invoice not `void` and not already `paid` (`INVOICE_ALREADY_PAID`),
   - **live** balance (`amount − Σ payments`) > 0.

   Creates a Checkout Session **on the connected account**
   (`{ stripeAccount: org.stripeConnectAccountId }`), `mode: "payment"`, a
   **single line item** = the invoice balance, `metadata: { invoiceId, orgId,
   balanceDueCents }`, `success_url` back to the invoice page with
   `?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` back to the invoice page.
   Pass an **idempotency key**. **No `application_fee_amount`.** Restrict to
   `card` payment methods for v1 (predictable fee, single capability).
   Sessions are minted **on demand at pay-time** (not at send) — this sidesteps
   the stale-snapshot-link problem entirely.

2. **Webhook** `checkout.session.completed` (+ `payment_intent.succeeded` as a
   backstop) is the **source of truth**.

3. **Reconcile-on-return fallback:** `success_url` loads the invoice page with
   `?session_id=…`; the page calls `POST /api/invoice-review/[token]/confirm`,
   which retrieves the session and records the payment if the webhook hasn't
   landed yet. Makes the happy path robust on preview deployments where
   webhooks are awkward, and resilient to webhook delay generally.

Both the webhook and the confirm endpoint funnel through one idempotent
`recordStripePayment()`, keyed on `Invoice.stripePaymentIntentId @unique` +
`Payment.stripeChargeId @unique`, so duplicate delivery cannot double-record.
It wraps the existing `recordPayment()` transaction (status recompute +
`InvoiceEvent`), adding the idempotency guard and the fee/net capture.

**Fee/net capture:** when recording, expand
`payment_intent.latest_charge.balance_transaction` to read `fee` and `net`
(in the connected account's currency) and store them on the `Payment`.

## Connected-account onboarding

New **`/settings/payments`** page (admin only, alongside `workspace` /
`members`):

- If `stripeConnectAccountId` is null → "Set up payments" →
  `POST /api/org/stripe/connect` creates the v2 account + an **account link** →
  redirect to Stripe-hosted onboarding → return URL.
- Status (pending / active / restricted) is read from capability status,
  cached on the org (`stripeConnectStatus`), and refreshed by the
  `account.updated` Connect webhook.
- Until `card_payments` is `active`, the public **"Pay now"** button is hidden
  and the contractor sees an onboarding prompt.

## Test vs production environments

Stripe runs **two fully isolated worlds — test mode and live mode** (separate
keys, connected accounts, webhooks, and data; nothing crosses). Mapped onto
SqFt's existing three tiers:

| | Local dev | Vercel Preview (PRs) | Vercel Production |
| --- | --- | --- | --- |
| Stripe mode | test | test | **live** |
| Keys | `rk_test_…` | `rk_test_…` | `rk_live_…` |
| DB (Neon) | dev branch | PR branch | prod branch |
| Connected accts | `acct_…` test | `acct_…` test | `acct_…` **live** |
| Webhooks | Stripe CLI `stripe listen` | one shared test endpoint (stable alias) | dedicated live endpoint |

**Keys are global per-deployment** (mirroring the existing `RESEND_API_KEY`
pattern — not per-org). New env vars (added to `.env.example`):

- `STRIPE_SECRET_KEY` — a **Restricted API Key** (`rk_`, not `sk_`) scoped to
  Checkout + PaymentIntents + Connect, per Stripe best practice.
  `rk_test_…` locally/preview, `rk_live_…` in prod.
- `STRIPE_WEBHOOK_SECRET` — `whsec_…`, **different per endpoint/mode**.
- `STRIPE_CONNECT_RETURN_URL` (or a base-URL var) for onboarding + checkout
  redirects, derived from the deployment URL.
- (`STRIPE_PUBLISHABLE_KEY` not needed for hosted Checkout; reserve for a future
  Payment Element.)

**Load-bearing invariant:** the Stripe **mode of the keys must match the mode of
the `stripeConnectAccountId`** stored in the DB you are pointed at. This holds
**by construction** — dev/preview DBs only ever hold test `acct_` ids (created
with test keys), and the prod DB only holds live ones. A contractor who
onboarded in production must **onboard again** the first time the app runs in a
test environment. `lib/stripe/client.ts` detects mode from the key prefix and
surfaces a clear error if a session-create ever hits a wrong-mode account.

**Local webhook testing:**
`stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe` prints a
temporary `whsec_`; `stripe trigger checkout.session.completed` and the
`stripe:test-cards` test card `4242 4242 4242 4242` exercise the full path with
no real money. **Preview** relies primarily on the reconcile-on-return fallback,
with one shared test-mode endpoint pointed at a stable preview alias for
webhook-specific testing. **Production** gets its own live-mode endpoint
registered to the prod domain.

**Go-live:** set `rk_live_…` + the live `whsec_` in Vercel Production only; each
contractor onboards a live connected account; verify
`card_payments.status === "active"` before the "Pay now" button activates for
them. (See Stripe's go-live checklist.)

## Data model changes

One **additive** migration (nullable / defaulted columns only — per the
"no `ADD COLUMN NOT NULL` on a populated DB" rule; backfill not required because
all new columns are nullable or defaulted). `prisma/seed.ts` updated in the same
change.

- `Organization`:
  - `stripeConnectStatus String?` — cached capability state
    (`pending | active | restricted`).
  - `stripeConnectOnboardedAt DateTime?`.
  - (`stripeConnectAccountId String?` already exists.)
- `Payment`:
  - `stripeFeeAmount Float?` — Stripe fee in dollars (from balance transaction).
  - `stripeNetAmount Float?` — contractor net in dollars.
  - (`stripeChargeId String? @unique` and `method` including `"stripe"` already
    exist.)
- New `ProcessedStripeEvent { id String @id; createdAt DateTime @default(now()) }`
  — webhook event-id dedupe + audit.
- `Invoice.stripePaymentLinkUrl` becomes effectively **legacy** (sessions are
  minted on demand, not persisted as links); `stripePaymentIntentId @unique`
  is the idempotency anchor. (Both columns already exist.)

## Modules and files

New `lib/stripe/` module:

- `client.ts` — lazy singleton Stripe client (mirrors `lib/email/client.ts`),
  reads `STRIPE_SECRET_KEY`, pins `apiVersion`, exposes key-mode detection.
- `connect.ts` — create connected account + account link + capability-status
  read.
- `checkout.ts` — pure session-input builder + `create` (on connected account).
- `webhook.ts` — signature verify + event routing (pure-ish; calls the repo).

Repositories:

- `invoiceRepo.ts` — add idempotent `recordStripePayment(...)` (wraps
  `recordPayment`, adds idempotency guard + fee/net capture) and setters for
  `stripePaymentIntentId`.
- org connect getters/setters (extend `orgRepo` or the org route layer).

Routes:

- `POST/GET /api/org/stripe/connect` — admin; create account + onboarding link,
  read status.
- `POST /api/invoice-review/[token]/checkout` — public, allowlisted; create
  Checkout Session.
- `POST /api/invoice-review/[token]/confirm` — public, allowlisted;
  reconcile-on-return.
- `POST /api/webhooks/stripe` — **raw-body, signature-verified**, allowlisted;
  bypasses the JSON `apiRoute` wrapper (reads `await req.text()`).

UI:

- `/settings/payments` (admin) — onboarding + status.
- `/invoice-review/[token]` — "Pay now" button (only when org active), plus
  success / cancel states from the redirect query params.
- Invoice detail (builder) — show Stripe payments with fee/net breakdown.

## Error codes (added to `CONTEXT.md`)

- `STRIPE_NOT_CONNECTED` (409) — org has no connected account.
- `STRIPE_ACCOUNT_RESTRICTED` (409) — connected account exists but
  `card_payments` is not `active`.
- `INVOICE_ALREADY_PAID` (409) — checkout requested on a `paid` invoice.
- `STRIPE_WEBHOOK_INVALID` (400) — webhook signature verification failed.

## Testing strategy

- **Unit:** webhook routing + idempotency against an **in-memory fake** (the
  `lib/send` pipeline test pattern — no real Stripe); pure Checkout
  session-input builder; mode-detection in `client.ts`.
- **Integration:** `recordStripePayment` idempotency (double-deliver the same
  event → one `Payment`), gated on `VITEST_DB_AVAILABLE`.
- **E2E (Playwright):** drive up to the redirect (Pay now → session created →
  `session.url` returned) and the reconcile-return path; **do not** drive
  Stripe's off-domain hosted page. Use `stripe trigger` for the webhook and the
  `4242…` test card.

## Docs to update in the same change

- `CONTEXT.md`: update the **Invoice** section line "Payments are recorded
  manually … Stripe execution is out of scope" → describe the Stripe Checkout
  flow; add the new **error codes**; note the fee/net capture on `Payment`.
- `AGENTS.md`: add the new `lib/stripe/` module, the `/settings/payments`
  surface, the `/api/webhooks/stripe` raw-body route, and a gotcha on the
  test/live **mode-must-match-stored-account-id** invariant.

## Out of scope (v1)

- Embedded Connect.js onboarding components (account links instead).
- Embedded Payment Element (hosted Checkout instead).
- ACH / bank-debit payment methods (cards only for predictable fee + single
  capability).
- Refunds from within SqFt (handled in the contractor's Stripe dashboard for
  v1; a `POST refund` surface is a clean follow-up).
- Any change to SqFt's **own** SaaS billing of orgs
  (`stripeCustomerId` / `stripeSubscriptionId` — separate concern, untouched).
