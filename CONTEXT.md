# Domain Glossary

Terms that show up in the code and in conversation about it. **Keep this current
in the same change** that adds, renames, or retires a concept, alters a
lifecycle/status set, changes a single-source-of-truth computation, or
adds/renames an API error code — edit the affected section and its file pointer
rather than appending. (See *Keeping these docs current* in `AGENTS.md`.)

## Domain Hierarchy

The core record chain is:

`Customer → Location → SiteMeasure → Estimate`

A **Customer** is a person or household. A **Location** is one of that
customer's physical sites (a customer can have several — e.g. a primary
residence and a rental). A **Site Measure** is the room-by-room measurement
taken at a location. An **Estimate** is a priced, customer-facing document
built from a site measure; a site measure can spawn several estimates (e.g. a
revision after a decline).

## People

There is one notion of "a person": a **User** (`lib/repositories/userRepo.ts`).
A user has a `role` (`admin | lead | crew`) and an optional free-text `title`
(e.g. "Lead Installer"). Any non-archived user — of any role — is **assignable**
to calendar Events; the schedule's crew picker and `/api/users/assignable` are
sourced from active users. `User.archived` **deactivates** a person: they can't
log in (`lib/auth.ts`) or be newly assigned, but their history is preserved.
Events link assigned users via the `Event.assignees` relation
(`eventRepo` `assigneeIds: string[]`). People are managed on the admin
**Members** page (`/settings/members`) — role, title, archive/restore — for
the caller's **own** org; there is no separate crew roster. A **super-admin**
manages **any** org's members the same way from `/admin/orgs/[orgId]`, via the
same `userRepo` functions with the target org taken from the URL instead of
the caller's session.

The editable **Schedule Manager** grid (`/schedule`, **lead+ only** — crew is
redirected to `/my-schedule`) and the read-only, mobile-first **My Schedule**
day view (`/my-schedule`, any role incl. crew — crew's home page) both read the
same events list. `eventRepo.listEvents` enriches that payload with a derived
`address` (estimate's site-measure location → customer's first location;
resolver in `lib/events/serialize.ts`) and `customer.phone`, so the agenda
card and job-card detail sheet need no extra fetch. Agenda sectioning
(My/Team × Day/Week) is pure logic in `lib/schedule/agenda.ts`; the grid's
geometry (7a–7p window, overlap lanes, out-of-range clamping with ↑/↓ chip
markers, click-to-time snapping, now-line) is pure logic in
`lib/schedule/grid.ts`. The header row and the day columns are cells of **one
CSS grid**, so they share column tracks and the day dividers can't drift out of
alignment; the grid is a fixed height that always fits, so it deliberately has
no scroll container of its own (the page scrolls). Chips are laned by their
**clamped** rects, not their clock times — otherwise two events pinned to the
same grid edge would be drawn on top of each other. Same-day events must end
after they start (multi-day events may wrap past midnight): the form blocks it,
zod refines what a payload can prove in `lib/events/schema.ts`, and
`eventRepo.createEvent` / `updateEvent` are the backstop that checks the merged
stored ∪ incoming state — a partial PATCH can otherwise invert times the refine
never sees. A `job` event requires an estimate (server rule in `eventRepo`,
mirrored client-side).

The schedule page also shows the **unscheduled-jobs backlog**: approved
estimates with **no linked `job` event**, oldest approval first. The rule is
the pure projection `toSchedulableCandidates` in `lib/schedule/backlog.ts`
(mirroring quick-invoice candidates), queried by
`estimateRepo.listSchedulableEstimates` and served by
`GET /api/estimates/schedulable` (lead+). The `BacklogStrip` renders the
candidates above the grid; clicking one opens the event form pre-filled
(type=job, customer, estimate), and event mutations invalidate the backlog
query so scheduling removes the card immediately.

## Document Numbers

Site measures, estimates, and invoices each carry a per-org sequential number
(`siteMeasureNumber`, `estimateNumber`, `invoiceNumber`) allocated from a
counter on `Organization` (`nextSiteMeasureNumber` / `nextEstimateNumber` /
`nextInvoiceNumber`). The create paths in the repos (`siteMeasureRepo` /
`estimateRepo` / `invoiceRepo`) reserve a number with an **atomic
increment-returning update** inside the create transaction
(`organization.update({ data: { nextXNumber: { increment: 1 } }, select: { … } })`,
then `reserved = returned − 1`). This locks the org row so concurrent creates
can't allocate the same number — a plain `findUnique` read does **not** lock
under READ COMMITTED. The numbers are guarded by `@@unique([orgId, *Number])`
on each model (`siteMeasureNumber` is nullable, so multiple NULLs are allowed).
Do not reintroduce a read-then-write allocation.

## Location

A physical site address belonging to a customer (`address`, optional `label`
and `notes`). Site measures hang off a Location, not directly off the
Customer, so addresses live in one place and a customer's multiple sites stay
distinct. Org-scoped like everything else. Repo: `lib/repositories/locationRepo.ts`.

## Site Measure

The measurement record for a location: a set of room measurements
(`SiteMeasureItem` rows) plus a `siteMeasureNumber`; it carries no pricing. A
room is a set of L×W **boxes** (`segments` JSON — a non-rectangular room is
entered as several boxes whose areas sum), or a legacy single box from the
scalar `w`/`l`. `saveSiteMeasure` canonicalizes on write so the DB never holds
both: a single box persists as scalar `w`/`l` (`segments` NULL), only a
multi-box room persists `segments` (scalars NULL). Reads narrow the JSON
column through `parseRoomSegments` (`lib/utils.ts`) — never a bare cast.
Rooms are rectangles-only: the `shape` column is a legacy no-op (the old
triangle-area special-case was removed, and writes only accept `"rect"`).
Square footage and perimeter are the single source of truth in `roomSqft` /
`roomPerimeter` (`lib/utils.ts`), which sum the boxes via `segmentSqft`
(perimeter sums each box, over-ordering trim rather than modeling shared
walls); linked line quantities read those.
The measurement UI lives in `components/siteMeasures/` and
`app/(app)/site-measures/`; the repo is `lib/repositories/siteMeasureRepo.ts`.

## Estimate View

The fully-computed read model of an estimate: per-line `effectiveQty` and
`subtotal`, plus totals (`subtotal`, `markup`, `total`, `deposit`) and a
`hasUnresolvedLines` flag.

Single source of truth for estimate math. Produced by `computeEstimateView` in
`lib/estimateView/` (`compute.ts`). Every caller — the editor
(`LineItemSection`), the customer-facing public page (`PublicEstimateView`),
the send-email route, the estimate list endpoint, and the approval snapshot —
derives its numbers from this one function so the labeled breakdown can never
diverge across surfaces.

Callers map their concrete representation (Prisma row, public payload, editor
form state) to `EstimateInput` at the seam. The Prisma adapter lives at
`lib/estimateView/fromPrisma.ts` (`fromPrismaEstimate`).

`computeEstimateView` lines carry their `id` (`LineView.id`), and consumers
that re-attach side-channel metadata to computed math **join by id, never by
array position** — so a future reorder/filter/drop in the view is a loud
failure, not silently mispaired money. The approval snapshot
(`snapshotEstimate`, `lib/estimateView/snapshot.ts`) throws if a line item's id
is absent from the computed view; invoice proration (`prorateInvoice`,
`lib/invoices/compute.ts`) keys `lineMeta` by id (`ProrationSource.lineMeta`
carries `id`, set in `buildInvoiceProrationSource`).

## Estimate Draft

The editable, not-yet-reconciled working copy of an estimate's inputs while a
lead is building it: the `lineItems` plus the two money fields
(`markupPct`, `depositPct`). The write-side counterpart to **Estimate View** —
Draft is what you *edit*, View is what you *read* (the computed totals derived
from a Draft).

Held in **storage form**, identical to the Prisma columns and to
`EstimateInput`: `depositPct` is a decimal (`0.5`), `markupPct` is a
percentage (`20`). Percent ↔ decimal conversion for deposit happens only in
the on-screen input widgets, never inside the Draft, so a Draft can be handed
straight to `computeEstimateView` and straight into a save patch with no
translation.

The Draft's mutation semantics live in a pure reducer (`lib/estimateDraft/`):
`(draft, action) → { draft, save }`. Actions are the editing operations —
add / update / remove a line item, apply a template (copies
name/description/rate/unitLabel only — never qty or room scope), set a money
field, and commit-subtotal (back-calculates `rate = subtotal / effectiveQty`;
the action carries `effectiveQty` since it derives from the View, not the
Draft). Each transition also returns the **save patch** to persist, or `null`
when nothing should be saved — that is how the two save triggers are encoded:
structural edits emit a patch immediately, plain text edits (name/description)
emit `null` and are persisted on blur. The React layer
(`LineItemSection`/`EstimateBuilder`) is a thin adapter: it seeds the Draft
once at mount (no resync from server refetch), dispatches actions, and forwards
any emitted patch to `onSave`.

## Markup

`markupPct` is an **internal** pricing setting — the customer never sees a
"Markup" or "Labor & margin" line. On every customer-facing surface the markup
is instead *folded* into the line-item prices: each resolved line is shown at
`lineSubtotal × (view.total / view.subtotal)`, reconciled so the displayed
rows sum exactly to `view.total`. Internal builder views (the estimate editor
totals, billing breakdowns) still break markup out as its own number.

The fold lives in `foldMarkupIntoLines` (`lib/estimateView/markup.ts`), next to
the estimate-view math. It returns one amount per line — `null` stays `null`
for unresolved lines, which receive no markup. The penny-rounding residual is
steered onto the largest-priced resolved line by `residualTargetIndex`
(`lib/money.ts`), so the ±cent never lands on a $0 (free) line or an
unresolved line. `lib/money.ts` is the shared home for
`round2` and `residualTargetIndex`, used by both the fold and invoice
proration. `round2` is itself `roundToDecimals(n, 2)` — the generic,
epsilon-nudged half-up rounder also exported for non-2dp callers;
`components/ui/DecimalInput` (the shared money/quantity input) commits through
`roundToDecimals(n, maxDecimals)` so a value's on-blur commit can never
diverge from what this SSOT math would round it to.

Two customer surfaces consume the fold:

- **Public estimate** — line rows render marked-up prices; `TotalsBlock`
  (`components/estimates/public-estimate/`) shows the marked-up Total (and
  deposit), with **no** "Labor & margin" row. Already-signed snapshots keep
  their frozen historical form and are never rewritten.
- **Invoice** — `prorateInvoice` distributes the folded line prices by the bill
  ratio and emits no "Markup" row (see **Invoice**).

## Estimate Approval

Approval is **one-click**: the customer opens the public estimate-review page
(`/estimate-review/[token]`) and presses a single button, which POSTs to
`/api/estimate-review/[token]/approve` with no body. There is no drawn
signature, no name/email entry, and no consent text.

The approve transaction flips the estimate's status to `approved`, stamps
`approvedAt`, logs an `approved` EstimateEvent, and writes an
`EstimateApproval` row capturing `ip`, `userAgent`, and a lightweight
`snapshot` (the Estimate View + identifying metadata such as `estimateNumber`,
`date`, `customer`, and the location `address`). The snapshot is a plain JSON
record of what the customer saw — there is **no** `snapshotHash` and no
tamper-evidence hashing. **The public page renders an `approved` estimate from
this snapshot, never from the live rows**: `parseEstimateSnapshot` /
`estimateViewFromSnapshot` (`lib/estimateView/parseSnapshot.ts`) validate the
stored JSON and rebuild the frozen `EstimateView` (per-line qty/subtotal +
signed totals), which the page passes to `PublicEstimateView` as `frozenView`
so no money is recomputed. A snapshot that fails validation logs and falls
back to the live render. Pre-approval (`sent`/`viewed`) estimates still render
live — they are editable, and the page is the authoritative thing the customer
approves. Approving an estimate also supersedes any other open
estimates under the same site measure (they're marked `declined` with a
"Superseded" reason and a `system_supersede` event).

Estimate status values: `draft | sent | viewed | approved | declined`.

## Invoice

A priced estimate can spawn **multiple** customer-facing invoices, each billing
a free-form dollar `amount` or a percentage `pct` of the estimate total. The
billing math is the single source of truth in `lib/invoices/` (mirroring
`lib/estimateView`): `computeEstimateBilling` rolls up invoiced/unbilled/paid/
outstanding across an estimate's non-void invoices, and `prorateInvoice` splits
each invoice's amount across the estimate's line items by the bill ratio.
Markup is folded into the line prices (via `foldMarkupIntoLines` — see
**Markup**), so neither a "Markup" row nor a fee row is emitted. Unresolved
lines are omitted rather than billed as $0, and the rounding residual
reconciles onto the largest row so the displayed rows sum exactly to the billed
amount without the ±cent distorting a free line. Creating or editing an
invoice past the estimate's unbilled balance
throws `INVOICE_OVERBILL`; the overbill test is the shared `isOverbill`
predicate (`lib/invoices/createInvoiceForm.ts`), which owns the single
`OVERBILL_EPSILON` (0.005) tolerance used by both the repo guard and the create
dialog.

Invoices are emailed via a public token page (`/invoice-review/[token]`),
reusing the React-Email + Resend flow. On send, the invoice freezes a
`snapshot` (identity + prorated lines + balance-due totals) so the customer
document can never drift from later estimate edits; the public page renders
from that snapshot and flips `sent → viewed` on first open. **Balance due is
the exception**: both the public page and the builder's `InvoiceDetail`
compute it live from the payments ledger (`amount − Σ payments`) — a
partially-paid invoice must never show the full amount as still owed.

Homeowners pay the exact invoice balance via a Stripe-hosted **Checkout
Session** created on the org's Stripe Connect account (direct charge; the
contractor bears the processing fee — no surcharge to the homeowner). The
session is created from the public `/invoice-review/[token]` page and
resolves on the contractor's connected account (Accounts v2, full dashboard,
Stripe as fees+losses collector). Payment is recorded into the `Payment` ledger
by a **signature-verified webhook** (`POST /api/webhooks/stripe`) AND an
**idempotent reconcile-on-return** endpoint (`POST
/api/invoice-review/[token]/confirm`), both via the idempotent
`recordStripePayment` (keyed on `Payment.stripeChargeId @unique`). Three
load-bearing invariants live here: (1) the webhook resolves the owning org from
the **signed `event.account`** (`getOrgIdByConnectAccount`), never from
attacker-controllable `metadata.orgId`, so one connected account can't mark
another org's invoice paid; (2) both paths key idempotency on the **real charge
id (`ch_…`)** and *defer* (webhook throws to retry, confirm returns `pending`)
when it isn't attached yet, rather than synthesizing a divergent `pi_…` id that
would double-record; (2b) **money is only recorded when it exists**: card
payments settle synchronously, but ACH bank debits (capability requested at
account creation alongside cards) complete Checkout *before* settling, so the
webhook records `checkout.session.completed` only when `payment_status ===
"paid"` — an unpaid completion is skipped and settlement lands days later via
`checkout.session.async_payment_succeeded` / `payment_intent.succeeded`
(register all three, plus `checkout.session.async_payment_failed`, on a
**Connected-accounts-scoped** webhook endpoint). A bounced debit fires
`async_payment_failed` → `recordStripePaymentFailure` (org-scoped) leaves a
`payment_failed` `InvoiceEvent` + `logError`, no ledger row. Meanwhile the
confirm endpoint returns `processing` for a complete-but-unpaid session and
`PaymentConfirm` shows bank-processing copy, never a false confirmation — but a
bounced debit leaves the session `complete`/`unpaid` forever, so confirm reads
the PaymentIntent status (`requires_payment_method` / `canceled`) and returns
`failed` (`PaymentConfirm` shows retry copy) instead of "processing" indefinitely;
(3) a captured charge is **never silently dropped** —
`classifyStripeCharge` (single source of truth, `lib/repositories/invoiceRepo.ts`)
records it even when the invoice was voided after checkout (`orphaned`) or already
covered (`overpaid`), flagging the anomaly with a `refundNeeded` `InvoiceEvent`
+ `logError`; a charge never resurrects a `void` invoice. `recordStripePayment`
returns `{ overpaid }` so the confirm endpoint can return `overpaid` (refund
notice) rather than a plain "Payment received". Paid money that can't be
attributed at all — unknown `event.account`, or missing/non-numeric `invoiceId`
metadata — is parked in the queryable **`StripeAnomaly`** table (`recordAnomaly`,
keyed on the Stripe event id) + `logError` before the event is marked processed,
so it's reconcilable, never lost. The stale-session double-collection window is
capped by a 30-min-bucketed Checkout `expires_at`; the idempotency key carries
the same bucket (`inv-{id}-bal-{cents}-{bucket}`) so re-clicks replay one session
while a new bucket or changed balance mints a fresh one. `Payment` carries
`stripeFeeAmount` / `stripeNetAmount` (dollars, captured from the charge's balance
transaction on the connected account). Manual payment recording (cash, check,
card, ACH) also remains via the builder's Record-payment dialog. Each payment
recomputes the invoice status from the ledger. A `void` invoice is terminal and excluded from
all billing math; editing a sent invoice or paying a void one throws
`INVOICE_LOCKED`. Its public link dies with it: the review page `notFound()`s a
`void` invoice (and `PublicInvoiceView` never renders a pay CTA for one) so a
stale email link can't view or pay a cancelled document. Every lifecycle action
appends an `InvoiceEvent`.

**Connect onboarding status.** `Organization.stripeConnectStatus` is
`pending | active | restricted | unsupported` (`ConnectStatus`,
`lib/stripe/connect.ts`), derived from the merchant `card_payments` /
`ach_debit_payments` capabilities by `aggregateConnectStatus` — **best-of**,
since Checkout offers whichever method is live. `unsupported` is terminal
(Stripe will never enable the capability for this business / country / entity
type) and is deliberately *not* folded into `pending`, which the settings page
presents as a retryable "Continue setup". The column is a **write-through cache
for the public pay path only** — `/invoice-review/[token]` gates its Pay button
on it — so both the admin settings route and the checkout route re-read Stripe
live: a cached `active` that is never re-checked hides a later restriction from
the contractor until a customer's payment fails. There is **no `account.updated`
webhook** (Accounts-v2 status changes arrive as v2 core events, which SqFt does
not subscribe to), so `/settings/payments` polls for a bounded window after
onboarding returns. `connectPhase` (`lib/stripe/connectPhase.ts`) is the one
selector both the page's card and the poller's stop condition read, so the copy
and the polling cannot disagree. `summarizeRequirements` collapses Stripe's
requirement entries to `{ actionDue, inReview, issues }`: `actionDue` keys on
`minimum_deadline` (an `eventually_due` requirement is future work and blocks
nothing), and `issues` carries *every* failure for the side that is actually
holding things up — never a Stripe-side error attributed to the user.

Invoice status values: `draft | sent | viewed | partial | paid | void`.

**Org-wide list.** `GET /api/invoices` (lead+) lists all org invoices —
`listInvoices` in `lib/repositories/invoiceRepo.ts` — with pagination, search
(customer name / invoice #), sort, and a `status` filter of
`all | open | draft | paid | void`, defaulting to **`all`**. The `open`
group — `sent + viewed + partial` ("sent but not fully paid") — is the
second pill and is defined once as `OPEN_INVOICE_STATUSES` in
`components/invoices/filterInvoices.ts`. Each row carries a computed
`balanceDue` (amount − recorded payments). Facet counts are org-wide and
ignore the active filter/search.

**Builder UI.** The estimate page's `InvoicesSection`
(`components/invoices/`) shows a billing summary (Invoiced / Unbilled /
Outstanding, from `computeEstimateBilling`) plus a compact per-invoice list;
each invoice opens its own page at `/invoices/[id]`
(`app/(app)/invoices/[id]/page.tsx` → `components/invoices/InvoiceDetail.tsx`).
Create / Send / Record-payment / Void are modals
(`components/invoices/*Dialog.tsx`) built on the shared `components/ui/Modal.tsx`,
all wired through react-query hooks in `lib/hooks/useInvoices.ts`. Invoices are
**read-only** — there is no edit UI (the `PATCH` route is intentionally unused);
to change billed lines, fix the estimate or create another invoice. The
record-payment form defaults to the full outstanding balance but accepts
partials, and its method dropdown excludes `stripe` (reserved for the future
integration). The create dialog's three sizing modes (remaining / % of balance
/ flat) resolve to a dollar amount via the shared `deriveInvoiceAmount`
(`lib/invoices/createInvoiceForm.ts`) — the one definition of the mode→amount
mapping, used for both the live preview and the value POSTed — so the dialog
always submits a flat `amount`, never `pct`. (The backend's `pct` means "% of
estimate *total*", not "% of the remaining balance", so "% of balance" is
resolved client-side rather than sent as `pct`.)

## Send Pipeline

Emailing a customer-facing document (estimate, invoice) is one spine, owned
by `runSendPipeline` (`lib/send/pipeline.ts`): load + status guard → token
rotation (only when requested or the token is missing) → public URL → prepare
→ email → mark-sent → after-send side effects. The load-bearing invariants: a
**failed email never marks the document sent**, and mark-sent receives the
same prepared payload the email was built from, so what was mailed and what
was frozen (the invoice snapshot) cannot diverge.

Per-document variation lives in a **Sendable** adapter
(`lib/send/sendEstimate.ts`, `lib/send/sendInvoice.ts`): the org-scoped load,
the status guard (estimate: approved/declined → `ESTIMATE_LOCKED`; invoice:
void → `INVOICE_VOID`), the token column + rotation, the email payload,
mark-sent, and the estimate-only opportunistic customer-email update.
`onTokenRotated` is a **required** member — both documents log a
`link_rotated` event with actor attribution, and a document that chooses not
to audit rotation must say so with an explicit no-op, so silence is a visible
decision rather than drift. The existing repo mark-sent transactions keep
owning their atomic `sent`/`resent` event logging; the pipeline only
sequences.

No Prisma crosses the pipeline's seam — persistence arrives through the
adapter's functions — so the spine's ordering/error tests
(`__tests__/lib/send/pipeline.test.ts`) run against an in-memory fake with no
database. Routes are thin: parse input, resolve the sender (`requireSender`,
`lib/send/sender.ts`), call `sendEstimate` / `sendInvoice`.

## Quick Create

A global **"+ New" launcher** (sidebar + mobile drawer, lead+ only) opens a
slide-over that creates the next record in the chain by searching a customer
and picking the linkable parent — no separate "choose a customer, then choose a
site measure" steps. Two flows, one shell (`components/quick-create/`,
`QuickCreatePanel` is the presentational shell; `QuickCreateProvider` mounts the
panels and owns the hand-off):

- **Quick estimate** — search site measures (`useSiteMeasures`), pick one,
  create the estimate and open its (blank) builder — the same
  create-and-open action `SiteMeasureBuilder` exposes.
- **Quick invoice** — search **billable** estimates (those with a remaining
  balance, `unbilled > 0` — drafts included, mirroring `InvoicesSection`; *not*
  a status gate), pick one, then hand off to the existing `CreateInvoiceDialog`
  so the user chooses the amount before the draft is created and the ledger page
  opens.

Billable candidates come from `GET /api/estimates/invoiceable?q=`
(`listInvoiceableEstimates` in `lib/repositories/estimateRepo.ts`), which shapes
rows through the pure `toInvoiceableCandidates` (`lib/quickCreate/candidates.ts`)
— unbilled is derived from the single-source-of-truth `computeEstimateBilling`,
so voided invoices and cents rounding match the rest of the app. The endpoint
also returns the org's `defaultDepositPct` to seed the invoice dialog.

## API Error Codes

Every API route returns errors as `{ error: { code, message, details? } }`.
`code` is the stable machine-readable identifier; clients branch on it.
`message` is human-readable. `details` is present for validation failures and
carries the full list of Zod issues.

Standard codes:

- `UNAUTHORIZED` (401) — no session, or session has no org.
- `VALIDATION_FAILED` (400) — request body failed Zod parse. `details` holds
  the issues array.
- `NOT_FOUND` (404) — resource missing, or not visible to the caller's org.
- `CONFLICT` (409) — generic conflict; prefer a domain code below when one
  applies.
- `INTERNAL` (500) — unexpected error; the underlying cause is logged but not
  surfaced.

Domain codes:

- `ESTIMATE_LOCKED` (409) — caller tried to mutate an estimate whose status is
  `approved` or `declined` (including re-sending it).
- `ESTIMATE_HAS_EVENTS` (409) — caller tried to delete an estimate (or a site
  measure / customer above it — the cascade reaches descendant estimates) that
  still has scheduled Events (jobs) referencing it.
- `HAS_INVOICES` (409) — caller tried to delete an estimate / site measure /
  customer whose (descendant) estimates carry invoices. The
  Estimate→Invoice→Payment chain is `onDelete: Cascade`, so the delete would
  silently erase financial records; void invoices instead of deleting their
  records. Thrown by all three delete paths (`deleteEstimate`,
  `deleteSiteMeasure`, `deleteCustomer`).
- `EMAIL_FAILED` (502) — upstream email provider rejected the send. Minted by
  the send pipeline (`lib/send/pipeline.ts`) when the email port reports a
  non-OK result.
- `INVOICE_LOCKED` (409) — caller tried to edit an invoice that has been sent
  (status is no longer `draft`), or record a payment on a `void` invoice.
- `INVOICE_VOID` (409) — caller tried to send a `void` invoice. Distinct from
  `INVOICE_LOCKED`: void is terminal, and the remedy is creating a new
  invoice, not unlocking this one.
- `INVOICE_OVERBILL` (409) — caller tried to invoice more than the estimate's
  unbilled balance (estimate total − Σ non-void invoice amounts).
- `STRIPE_NOT_CONNECTED` (409) — the org has no Stripe Connect account
  configured; homeowner cannot pay via Stripe. Thrown by the checkout-session
  route (`app/api/invoice-review/[token]/checkout`).
- `STRIPE_ACCOUNT_RESTRICTED` (409) — the org's Stripe Connect account exists
  but is not yet enabled for charges (onboarding incomplete). Same route as
  above.
- `INVOICE_ALREADY_PAID` (409) — the invoice is already fully paid (or has no
  remaining balance) when a Stripe checkout session is requested. Thrown by the
  checkout-session route (`app/api/invoice-review/[token]/checkout`).
- `STRIPE_WEBHOOK_INVALID` (400) — the `stripe-signature` header failed
  verification; the webhook payload was rejected. Thrown by
  `app/api/webhooks/stripe/route.ts`.

Codes are produced by throwing an `ApiError` subclass from `lib/api/errors.ts`.
Routes throw; the `apiRoute` wrapper translates to the envelope.

Clients read the envelope via `readApiError(res, fallback)` from the same
module. It returns `{ code, message, details }` with safe fallbacks if the
body isn't JSON. Use it instead of inlining `res.json()` parsing — it keeps
the wire contract in one place and gives the caller access to `code` for
branching.
