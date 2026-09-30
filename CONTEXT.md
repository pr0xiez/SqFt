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
log in (`lib/auth/authorize.ts`, wired into `lib/auth.ts`) or be newly assigned, but their history is preserved.
Sessions are JWT-strategy and re-validate `archived`/`role`/`orgId` against the
DB on every request after sign-in (`lib/auth.ts`'s `jwt` callback, via
`userRepo.findAuthState`): archiving a user or changing their role takes effect
on their next request, not just their next login, and `session.maxAge` is 7
days (not the NextAuth default of 30).
Credential login (`lib/auth/authorize.ts` → `lib/auth/login.ts`) uses
`loginRepo`'s atomic database statement to lock after five failed attempts
for 15 minutes. An expired lock starts a fresh attempt budget, and attempts
during a lock do not extend it. All failures return the same generic result;
unknown, archived, and locked accounts pay a dummy bcrypt comparison to
reduce timing differences (this is not a constant-time guarantee).

Events link assigned users via the `Event.assignees` relation
(`eventRepo` `assigneeIds: string[]`). People are managed on the admin
**Members** page (`/settings/members`) — role, title, archive/restore — for
the caller's **own** org; there is no separate crew roster. A **super-admin**
manages **any** org's members the same way from `/admin/orgs/[orgId]`, via the
same `userRepo` functions with the target org taken from the URL instead of
the caller's session. The self-org and super-admin user create/patch routes
share one request-validation schema (`lib/users/schema.ts` —
`userCreateSchema` / `userPatchSchema`) and one orchestration helper
(`applyUserPatch` in `userRepo.ts`, role → profile → archived → re-fetch);
only the self-demote/self-archive guards differ, injected into
`applyUserPatch` as callback hooks.

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
the send-email route and the approval snapshot —
derives its numbers from this one function so the labeled breakdown can never
diverge across surfaces.

Every money field it returns — each line's `subtotal`, plus `subtotal`,
`markup`, `total`, `deposit` — is passed through `round2` (`lib/money.ts`)
before being returned, and each is derived from already-rounded upstream
values (e.g. `total` sums the rounded `subtotal` and `markup`, not raw
products) rather than rounding a single accumulated float at the end. This
matches the rounding convention `foldMarkupIntoLines` uses for line-level
amounts. Callers that persist or sum this output (`syncEstimateTotal`, the
dashboard revenue rollups) can rely on it already being cents-accurate; a
caller that further sums multiple estimates' `total` should still `round2`
the sum, since adding two already-rounded values can reintroduce binary
float drift.

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

**`approved`/`declined` are reachable only through the token routes.** The
general-purpose builder PATCH (`app/api/estimates/[id]/route.ts` →
`saveEstimate`, `lib/repositories/estimateRepo.ts`) cannot set an estimate to
either terminal status: `estimateUpdateSchema` (`lib/estimates/schema.ts`)
restricts the settable `status` enum to `draft | sent`, and `saveEstimate`
itself re-checks this at the repo layer (the trust boundary) and throws
`ValidationError` (`VALIDATION_FAILED`) if asked to set anything else — so a
looser schema or a rewired caller still can't forge an approval/decline and
skip the `EstimateApproval` consent row / supersede-siblings logic above.

Estimate status values: `draft | sent | viewed | approved | declined`, owned
by `lib/estimateStatus.ts`; filters include every status. Operator PATCH uses
the separate `draft | sent` subset, so it cannot forge customer audit events.
Sibling superseding uses a guarded UPDATE RETURNING in
`lib/repositories/estimateApprovalRepo.ts`; only changed rows receive events.
Missing client metadata becomes null in events and `unknown` only in the
non-null approval columns. Historical event rows may still contain `unknown`.

Estimate lists read the denormalized `Estimate.total` written by
`syncEstimateTotal` (`lib/repositories/estimateRepo.ts`); they do not load
line items or measured-room geometry to recompute each row. Draft text and
template unit labels remain round-trippable through `lineItemSchema`
(`lib/estimates/schema.ts`), including blank names while editing. Numeric
rate/quantity must be finite and nonnegative; waste is between 0 and 100.

An approved or declined estimate can be **revised**: `reviseEstimate`
(`lib/repositories/estimateRepo.ts`) clones it (line items, markup/deposit
pct) into a new `draft` estimate on the same site measure, linked back via
`revisedFromId`. The `approved | declined` source-status guard is enforced
**inside `reviseEstimate`'s transaction** (throws `ConflictError` — "Only
approved or declined estimates can be revised") rather than only in the route
— mirroring how `saveEstimate` throws `EstimateLockedError` in-repo for its
own edit-lock guard, so the invariant holds for any caller, not just the
`POST /api/estimates/[id]/revise` handler, which is a thin caller.

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
amount without the ±cent distorting a free line. Creating an
invoice past the estimate's unbilled balance
throws `INVOICE_OVERBILL`; the overbill test is the shared `isOverbill`
predicate (`lib/invoices/compute.ts`), which owns the single
`OVERBILL_EPSILON` (0.005) tolerance. This is the one constant for every
money-threshold comparison in the invoice domain — the create dialog's
client-side guard, the repo's create overbill check, the paid-in-full
status transition (`nextInvoiceStatus`), and the Stripe overpayment flag
(`classifyStripeCharge`), both in `lib/repositories/invoiceRepo.ts` — so no
`0.005` literal is ever inlined a second time.

Invoices are emailed via a public token page (`/invoice-review/[token]`),
reusing the React-Email + Resend flow. On send, the invoice freezes a
`snapshot` (identity + prorated lines + balance-due totals) so the customer
document can never drift from later estimate edits; the public page renders
from that snapshot and flips `sent → viewed` on first open. **Balance due is
the exception**: both the public page and the builder's `InvoiceDetail`
compute it live from the payments ledger via `paymentsPaidTotal` /
`invoiceOutstanding` (`lib/invoices/compute.ts`, re-exported from
`lib/invoices`) — `amount − Σ payments`, rounded with `round2` — the one
place that sums a payments array and rounds the final outstanding balance once, so a
partially-paid invoice never shows the full amount as still owed and no UI
surface hand-rolls its own `Math.round`. The list view's overdue rule (open
status + elapsed due date) is likewise centralized as `isInvoiceOverdue` in
the same file.

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
recomputes the invoice status from the ledger via `nextInvoiceStatus`
(`lib/repositories/invoiceRepo.ts`), which reads "was this ever viewed" off
the persisted `viewedAt` timestamp rather than the transient `current`
status — so an invoice that went `viewed` → `partial` and then has its
payment(s) reversed back to net 0 (e.g. a refund) falls back to `viewed`,
not `sent`, preserving the fact that the customer opened it. A `void` invoice is terminal and excluded from
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
`lib/invoices/statusFilter.ts`. Each row carries a computed
`balanceDue` (amount − recorded payments). The list's overdue rule (open
status + a due date whose UTC calendar day has fully elapsed) is the shared
`isInvoiceOverdue` (`lib/invoices/compute.ts`), so `InvoiceList` doesn't carry
its own copy of the date-boundary logic. Facet counts are org-wide and
ignore the active filter/search.

**Builder UI.** The estimate page's `InvoicesSection`
(`components/invoices/`) shows a billing summary (Invoiced / Unbilled /
Outstanding, from `computeEstimateBilling`) plus a compact per-invoice list;
each invoice opens its own page at `/invoices/[id]`
(`app/(app)/invoices/[id]/page.tsx` → `components/invoices/InvoiceDetail.tsx`).
Create / Send / Record-payment / Void are modals
(`components/invoices/*Dialog.tsx`) built on the shared `components/ui/Modal.tsx`,
all wired through react-query hooks in `lib/hooks/useInvoices.ts`. Invoices are
**read-only** — there is no edit UI and no update endpoint (`app/api/invoices/[id]/route.ts`
exports only `GET`); to change billed lines, fix the estimate or create another
invoice. The
record-payment form defaults to the full outstanding balance but accepts
partials, and its method dropdown excludes `stripe` (reserved for the future
integration). The create dialog's three sizing modes (remaining / % of balance
/ flat) resolve to a dollar amount via the shared `deriveInvoiceAmount`
(`lib/invoices/createInvoiceForm.ts`) — the one definition of the mode→amount
mapping, used for both the live preview and the value POSTed — so the dialog
always submits a flat `amount`, never `pct`. (The backend's `pct` means "% of
estimate *total*", not "% of the remaining balance", so "% of balance" is
resolved client-side rather than sent as `pct`.)

## QuickBooks Sync

**One-way push: SqFt is the source of truth, QBO is the bookkeeping mirror.**
Customers, **sent** invoices (built from the frozen snapshot — never
recomputed), payments (manual + Stripe, gross), and voids are pushed into the
org's connected QBO company. Nothing is ever pulled back, and no user action
ever blocks on QBO being reachable. Plan/spec:
`specs/2026-07-23-qbo-sync-plan.md`.

The engine (`lib/qbo/sync.ts`) is **port-based** — `QboPort` (API),
`SyncStore`/`TaskStore` (Prisma impls in `lib/repositories/qboRepo.ts`) — and
its reliability invariants are pinned one-to-one by tests in
`__tests__/lib/qbo/` (FakeQbo realm):

1. Tasks are idempotent **ensure-ops** (`ensureInvoiceSynced` ensures its
   customer + item first) — any execution order converges.
2. **Query-before-create** by natural key (Customer `DisplayName` always
   includes a stable `(SqFt #{id})` suffix so namesakes stay separate; a
   unique remote-identity index prevents two local records adopting one
   remote customer. Invoice
   `DocNumber` — plain number first, `SQFT-{n}` fallback past foreign
   occupants, adopt only on customer+total match — Payment `PaymentRefNum`
   `SQFT-P{id}`): a lost create response is adopted on retry, never
   duplicated.
3. **Enqueue-in-transaction**: `enqueueQboTaskTx` runs INSIDE the domain
   write (markInvoiceSent / recordPayment / recordStripePayment /
   voidInvoice / updateCustomer-with-link) so a connected org can never have
   a domain write with no sync intent — **including while the connection is
   auth-dead**: the task lands `paused_auth` and re-arms on reconnect. No-op
   when the org has never connected or intentionally disconnected. First
   send also re-arms payments recorded before a frozen snapshot existed.
   Both Stripe payment paths (webhook
   + checkout confirm) also kick an `after()` run like the manual paths.
4. Sync executes via `after()` attempts (latency) + the cron sweeper
   `GET /api/qbo/sync/run` (guarantee; `CRON_SECRET` bearer, every 5 min in
   `vercel.json`, most-overdue org first, `maxDuration` pinned) +
   opportunistic sweeps on the status endpoint. Tasks are **lease-claimed**
   (`claimDue` advances `nextAttemptAt` atomically) so racing runners can't
   double-run one task, and the terminal writes (`markDone`/`markFailed`)
   are **fenced on the claim identity** — a task re-enqueued while a run is
   in flight stays pending instead of being swallowed by the stale runner.
   A database lease on the connection serializes runners across instances;
   tasks are claimed one at a time immediately before processing. Both
   leases last six minutes, beyond the 300-second function limit. Backoff
   `2^attempts` min capped at 6h; terminal `failed` after 10 non-transient
   failures. Throttling, server outages and transport timeouts retain their
   retry budget and remain visible until recovered or manually retried.
5. **Auth death pauses, never drops**: `invalid_grant` marks the connection
   `disconnected` and flips pending tasks to `paused_auth`; reconnecting the
   SAME realm re-arms them (see invariant 3 for writes made during the
   outage). Connecting a DIFFERENT realm wipes the org's `QboLink`s (foreign
   ids must never be written to) and discards old tasks. An intentional
   disconnect uses `revoked`, ignores subsequent mutations, and discards
   held tasks on reconnect. API contexts and link writes are fenced to the
   runner's realm so an in-flight run cannot attach old-company identities.
   **No backfill on connect or realm
   switch**: records that predate the connection (or lost their links to a
   realm switch) are only pushed when something re-touches them (an edit,
   a payment, a manual Sync now).
6. **Token rotation is single-flight**: Intuit rotates refresh tokens
   (~24h); `getFreshAccessContext` refreshes under `SELECT … FOR UPDATE` on
   `QboConnection` and persists the pair atomically — the token fetch is
   capped at 10s so it can never outlive the transaction, and a
   post-exchange commit failure salvages the rotated pair out-of-band
   with a compare-and-set guard on the previous encrypted tokens, active
   status and realm; a newer grant or disconnect cannot be overwritten.
   Never call the token endpoint outside
   it. Accounting API calls are capped at 15s (`qboFetch`). Tokens are
   AES-256-GCM encrypted at rest (`lib/qbo/crypto.ts`, key
   `QBO_TOKEN_ENC_KEY`).

Payments retain their gross `TotalAmt`, but apply only up to the current QBO
invoice `Balance`; any excess is an unapplied customer credit. Missing
balance fails visibly. Voiding a mirror does not refund or remove prior
payments; bookkeeping cleanup of the resulting credit is manual. Tax is
taken from the frozen snapshot; this does not configure a company's tax
codes or replace its tax reconciliation.

Surfaces: admin **Settings → Integrations** (`/settings/integrations`,
`QuickBooksCard` + `SyncHealthPanel` — connect/disconnect/reconnect, health
counts, failed rows linking to their retry surface and completed warning
notes (including DocNumber fallback) requiring bookkeeping review);
per-invoice badge (`QboSyncBadge`, fed by `qboSync` on the invoice detail
payload — synced / pending (bounded polling) / failed with Retry →
`POST /api/invoices/[id]/qbo-sync` (re-queues the invoice AND its payments;
failed payment syncs surface on the invoice badge too) / reconnect
(`auth_required`) / voided (`void_synced`)).

Environments: `QBO_ENVIRONMENT` = `sandbox | production | mock`; integration
is invisible when env is absent. `mock` serves the app's own test-only realm
(`app/api/qbo-mock`, state in `QboMockRealm`) used by the `qbo-*.spec.ts`
Playwright suites — refused in production, and specs skip when the target
deployment doesn't serve it. Tax: the invoice mapping emits QBO's
`TxnTaxDetail` override only when the (future, P0) tax contract fields are
present in the snapshot (`totals.taxAmount` et al).

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

`sendEstimate`'s opportunistic customer-email sync
(`customerRepo.updateCustomerEmail`) never fails the send itself — a
throw or a no-op update is caught and logged, same as any `afterSent` hook —
but unlike a bare `afterSent`, `sendEstimate` tracks the outcome per call
(building a fresh `Sendable` so the result isn't shared mutable state across
concurrent sends) and returns `{ customerEmailSaved: boolean }`. The send
route folds that into the response as `{ ok: true, customerEmailSaved }` so a
failed persist is visible in the API contract, not only in logs.

No Prisma crosses the pipeline's seam — persistence arrives through the
adapter's functions — so the spine's ordering/error tests
(`__tests__/lib/send/pipeline.test.ts`) run against an in-memory fake with no
database. Routes are thin: parse input, resolve the sender (`requireSender`,
`lib/send/sender.ts`), call `sendEstimate` / `sendInvoice`.

### Public tokens

`Estimate.approvalToken` and `Invoice.publicToken` are the **sole**
authentication factor for the unauthenticated `/estimate-review/[token]` and
`/invoice-review/[token]` pages — a live bearer credential capable of
one-click approval / payment on the customer's behalf. They must never appear
in a payload an authenticated API route returns to the browser: the repo
`select` constants behind the authenticated reads (`ESTIMATE_LIST_SELECT`,
`ESTIMATE_DETAILS_SELECT`, `INVOICE_SELECT`/`INVOICE_DETAIL_SELECT` in
`lib/repositories/{estimate,invoice}Repo.ts`) deliberately enumerate every
scalar column *except* the token, rather than `include`-ing it and stripping
it back out downstream. The only sanctioned reads of the live value are:
`rotateApprovalToken` / `rotateInvoiceToken` (always mint a fresh token — used
internally by the send pipeline's mint-if-missing `currentToken`/`rotateToken`
flow, `lib/send/pipeline.ts`), `getOrCreateInvoicePublicToken` (reuses the
existing token if there is one, minting only if missing — mirrors that same
pipeline semantics; backs `POST /api/invoices/[id]/public-token`, the
"copy public link" action, so repeated clicks don't invalidate a link already
shared with the customer) / the equivalent `POST /api/estimates/[id]/approval-token`
route, and `getEstimateForSend` (`lib/repositories/estimateRepo.ts`, a
server-only include used solely by `lib/send/sendEstimate.ts` — its result is
never returned from an API route). A detail payload instead carries a
`hasApprovalToken` / `hasPublicToken` boolean (`estimateHasApprovalToken` /
`invoiceHasPublicToken`) for UI affordances that only need to know whether a
link exists yet, not what it is.

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

- `UNAUTHORIZED` (401) — no session; org-scoped routes using `getOrgId` also
  reject a missing org. The auth proxy may return its own 401 body before the
  route handler runs.
- `FORBIDDEN` (403) — session exists but the caller doesn't meet the route's
  `minRole` / `superAdmin` gate. Distinct from `UNAUTHORIZED`: the caller is
  authenticated, just not permitted.
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
- `INVOICE_LOCKED` (409) — caller tried to record a payment on a `void`
  invoice.
- `INVOICE_VOID` (409) — caller tried to send a `void` invoice. Distinct from
  `INVOICE_LOCKED`: void is terminal, and the remedy is creating a new
  invoice, not unlocking this one.
- `INVOICE_OVERBILL` (409) — caller tried to invoice more than the estimate's
  unbilled balance (estimate total − Σ non-void invoice amounts).
- `INVOICE_OVERPAY` (409) — caller tried to record a manual payment
  (`recordPayment`) exceeding the invoice's outstanding balance (amount − Σ
  prior payments), using the shared `OVERBILL_EPSILON` tolerance. Scoped to the
  manual-payment path only — `classifyStripeCharge` (Stripe webhook charges)
  keeps its own `overpaid` flag instead, since a captured real-money charge
  must never be silently dropped.
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
- `QBO_NOT_CONNECTED` (409) — a manual QBO sync was requested but the org has
  no QuickBooks connection. Thrown by `/api/invoices/[id]/qbo-sync`.
- `QBO_AUTH_EXPIRED` (409) — the org's QBO connection exists but its
  authorization is dead; the remedy is reconnecting in
  Settings → Integrations (distinct from `QBO_NOT_CONNECTED`). Same route.

Codes are produced by throwing an `ApiError` subclass from `lib/api/errors.ts`.
Routes throw; the `apiRoute` wrapper translates to the envelope.

Clients read the envelope via `readApiError(res, fallback)` from the same
module. It returns `{ code, message, details }` with safe fallbacks if the
body isn't JSON. Use it instead of inlining `res.json()` parsing — it keeps
the wire contract in one place and gives the caller access to `code` for
branching. Every `lib/hooks/*` query/mutation goes through
`apiFetch<T>(url, init?, fallbackMessage?)` (`lib/hooks/apiFetch.ts`), which
wraps `fetch` + the `res.ok` check + `readApiError` + `res.json()` (204 → no
body, resolves `undefined`) in one call — so hooks never re-hand-roll this and
always surface the server's real message instead of a fixed generic string.

Public view and consent audit metadata uses `lib/http/clientMeta.ts`, backed by
`lib/request.ts`. Missing or blank addresses remain null; only required approval
columns use the unknown fallback. Platform-specific headers are used only on
Vercel. Other deployments need an ingress that appends or overwrites the client IP.
