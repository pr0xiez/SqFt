# Domain Glossary

Terms that show up in the code and in conversation about it. Keep updated as
concepts are added or sharpened.

## Domain Hierarchy

The core record chain is:

`Customer → Location → SiteMeasure → Estimate`

A **Customer** is a person or household. A **Location** is one of that
customer's physical sites (a customer can have several — e.g. a primary
residence and a rental). A **Site Measure** is the room-by-room measurement
taken at a location. An **Estimate** is a priced, customer-facing document
built from a site measure; a site measure can spawn several estimates (e.g. a
revision after a decline).

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
each invoice's amount across the estimate's line items (plus markup and
convenience-fee rows) by the bill ratio, reconciling rounding so the displayed
rows sum exactly to the billed amount. Creating or editing an invoice past the
estimate's unbilled balance throws `INVOICE_OVERBILL`.

Invoices are emailed via a public token page (`/invoice-review/[token]`),
reusing the React-Email + Resend flow. On send, the invoice freezes a
`snapshot` (identity + prorated lines + balance-due totals) so the customer
document can never drift from later estimate edits; the public page renders
from that snapshot and flips `sent → viewed` on first open.

Payments are recorded manually into a `Payment` ledger (the schema is
Stripe-ready but Stripe execution is out of scope). Each payment recomputes the
invoice status from the ledger. A `void` invoice is terminal and excluded from
all billing math; editing a sent invoice or paying a void one throws
`INVOICE_LOCKED`. Every lifecycle action appends an `InvoiceEvent`.

Invoice status values: `draft | sent | viewed | partial | paid | void`.

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
  `approved` or `declined`.
- `ESTIMATE_HAS_EVENTS` (409) — caller tried to delete an estimate that still
  has scheduled Events (jobs) referencing it.
- `CREW_MEMBER_IN_USE` (409) — caller tried to delete a crew member who is
  still assigned to one or more Events.
- `EMAIL_FAILED` (502) — upstream email provider rejected the send. Returned
  by the estimate-send route when Resend reports a non-OK result.
- `INVOICE_LOCKED` (409) — caller tried to edit an invoice that has been sent
  (status is no longer `draft`), or record a payment on a `void` invoice.
- `INVOICE_OVERBILL` (409) — caller tried to invoice more than the estimate's
  unbilled balance (estimate total − Σ non-void invoice amounts).

Codes are produced by throwing an `ApiError` subclass from `lib/api/errors.ts`.
Routes throw; the `apiRoute` wrapper translates to the envelope.

Clients read the envelope via `readApiError(res, fallback)` from the same
module. It returns `{ code, message, details }` with safe fallbacks if the
body isn't JSON. Use it instead of inlining `res.json()` parsing — it keeps
the wire contract in one place and gives the caller access to `code` for
branching.
