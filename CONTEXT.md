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
**Members** page (`/settings/members`) — the single people-management surface
(role, title, archive/restore); there is no separate crew roster.

The editable **Schedule Manager** grid (`/schedule`, **lead+ only** — crew is
redirected to `/my-schedule`) and the read-only, mobile-first **My Schedule**
day view (`/my-schedule`, any role incl. crew — crew's home page) both read the
same events list. `eventRepo.listEvents` enriches that payload with a derived
`address` (estimate's site-measure location → customer's first location;
resolver in `lib/events/serialize.ts`) and `customer.phone`, so the agenda
card and job-card detail sheet need no extra fetch. Agenda sectioning
(My/Team × Day/Week) is pure logic in `lib/schedule/agenda.ts`.

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
(`SiteMeasureItem` rows — rect rooms with width/length, or text notes) plus a
`siteMeasureNumber`. It carries no pricing. The measurement UI lives in
`components/siteMeasures/` and `app/(app)/site-measures/`; the repo is
`lib/repositories/siteMeasureRepo.ts`.

## Estimate View

The fully-computed read model of an estimate: per-line `effectiveQty` and
`subtotal`, plus totals (`subtotal`, `markup`, `convenienceFee`, `total`,
`deposit`) and a `hasUnresolvedLines` flag.

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
lead is building it: the `lineItems` plus the three money fields
(`convenienceFeeRate`, `markupPct`, `depositPct`). The write-side counterpart
to **Estimate View** — Draft is what you *edit*, View is what you *read* (the
computed totals derived from a Draft).

Held in **storage form**, identical to the Prisma columns and to
`EstimateInput`: `convenienceFeeRate` and `depositPct` are decimals (`0.03`,
`0.5`), `markupPct` is a percentage (`20`). Percent ↔ decimal conversion for
fee/deposit happens only in the on-screen input widgets, never inside the
Draft, so a Draft can be handed straight to `computeEstimateView` and straight
into a save patch with no translation.

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
`lineSubtotal × (view.beforeFee / view.subtotal)`, reconciled so the displayed
rows sum exactly to the marked-up subtotal (`view.beforeFee`). Internal builder
views (the estimate editor totals, billing breakdowns) still break markup out
as its own number.

The fold lives in `foldMarkupIntoLines` (`lib/estimateView/markup.ts`), next to
the estimate-view math. It returns one amount per line — `null` stays `null`
for unresolved lines, which receive no markup. The penny-rounding residual is
steered onto the largest-priced resolved line by `residualTargetIndex`
(`lib/money.ts`), so the ±cent never lands on a $0 (free) line, an unresolved
line, or the convenience-fee row. `lib/money.ts` is the shared home for
`round2` and `residualTargetIndex`, used by both the fold and invoice
proration.

Two customer surfaces consume the fold:

- **Public estimate** — line rows render marked-up prices; `TotalsBlock`
  (`components/estimates/public-estimate/`) shows Subtotal (already marked up)
  → Convenience fee → Total, with **no** "Labor & margin" row. Already-signed
  snapshots keep their frozen historical form and are never rewritten.
- **Invoice** — `prorateInvoice` distributes the folded line prices by the bill
  ratio and emits no "Markup" row (see **Invoice**).

The convenience fee is *not* folded — it stays its own customer-facing row/line
because it is a legitimate fee.

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
tamper-evidence hashing. Approving an estimate also supersedes any other open
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
**Markup**), so no "Markup" row is emitted; only the convenience fee remains a
separate row. Unresolved lines are omitted rather than billed as $0, and the
rounding residual reconciles onto the largest row so the displayed rows sum
exactly to the billed amount without the ±cent distorting the fee row or a free
line. Creating or editing an invoice past the estimate's unbilled balance
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

Payments are recorded into a `Payment` ledger either manually (`recordPayment`)
or automatically from Stripe (`recordStripePayment`, keyed idempotently on
`Payment.stripeChargeId`). The ledger holds **settled money only**: an in-flight
ACH writes no Payment row, only an `ach_processing` InvoiceEvent, so
`nextInvoiceStatus` is unchanged and an unsettled payment never reads as paid.
Online payment flows through Stripe Connect (Express) destination charges — see
the *Online Payments* section and
`docs/superpowers/specs/2026-06-14-online-payments-design.md`. Each payment
recomputes the invoice status from the ledger. A `void` invoice is terminal and
excluded from all billing math; editing a sent invoice or paying a void one
throws `INVOICE_LOCKED`. Every lifecycle action appends an `InvoiceEvent`.

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

## Online Payments

A customer pays an invoice from the public `/invoice-review/[token]` page via
**Stripe Connect (Express)**, one connected account per org. All Stripe access
sits behind a `StripeGateway` **port** (`lib/stripe/gateway.ts`) with a real
implementation (`realGateway.ts`, the only SDK call surface) and an in-memory
`fakeGateway.ts`, mirroring the send-pipeline seam — so the checkout builder
(`checkout.ts`, pure destination-charge params), onboarding orchestration
(`onboarding.ts`), and webhook dispatch (`webhookHandler.ts`) are all unit-
testable with no network and no DB.

The on-demand pay route (`GET /api/invoice-review/[token]/pay`) reads the
**live balance**, gates on the org's `stripeChargesEnabled` mirror (throws
`STRIPE_NOT_CONNECTED` / `INVOICE_ALREADY_PAID`), creates a Stripe-hosted
Checkout Session (cards + ACH) and 303s to it. The Pay button on the public
page renders only when `stripeChargesEnabled && balance > 0` and the invoice
isn't paid/void.

A signature-verified **webhook** (`POST /api/stripe/webhook`, a bare route — see
*Gotchas* in AGENTS.md) is the sole source of truth: `handleStripeEvent` records
a Payment via `recordStripePayment` **only on settled events** (cards:
`checkout.session.completed`+paid; ACH: `async_payment_succeeded` /
`payment_intent.succeeded`). In-flight ACH and failures write only
`ach_processing` / `ach_failed` / `payment_failed` InvoiceEvent markers, never a
ledger row — so the ledger stays settled-money-only and `nextInvoiceStatus` is
untouched. A PaymentIntent whose transfer destination disagrees with its
`metadata.invoiceId` org is logged (`stripe_org_mismatch`) and never recorded.
`account.updated` mirrors onboarding status onto the org's `stripe*` columns
(written only by the webhook / status sync — never client-settable). Connect
onboarding/refresh/status are admin routes under `/api/org/stripe-connect`,
surfaced in the workspace **Payments** settings section.

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
- `STRIPE_NOT_CONNECTED` (409) — pay route / Checkout creation for an org with
  no connected account or `stripeChargesEnabled=false`.
- `INVOICE_ALREADY_PAID` (409) — pay route invoked when the live balance is ≤ 0
  or the invoice is `paid`/`void`.
- `STRIPE_ONBOARDING_FAILED` (502) — Stripe API rejected an
  accounts/account_links/checkout-session create.
- `STRIPE_ORG_MISMATCH` (422) — webhook PaymentIntent's destination and
  `metadata.invoiceId` disagree on an org; logged + acked, never recorded.
- `STRIPE_WEBHOOK_SIGNATURE_FAILED` (400) — bare webhook route rejected the
  signature; plain 400 Response (not the envelope).

Codes are produced by throwing an `ApiError` subclass from `lib/api/errors.ts`.
Routes throw; the `apiRoute` wrapper translates to the envelope.

Clients read the envelope via `readApiError(res, fallback)` from the same
module. It returns `{ code, message, details }` with safe fallbacks if the
body isn't JSON. Use it instead of inlining `res.json()` parsing — it keeps
the wire contract in one place and gives the caller access to `code` for
branching.
