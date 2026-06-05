# Invoicing — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan

## Summary

Add staged invoicing to the estimate flow. An approved-or-priced estimate can
spawn **multiple invoices** over time (e.g. a deposit invoice, then progress /
final invoices). Each invoice bills a **free-form amount** — entered as a dollar
figure *or* a percentage of the estimate total — guarded by a running balance so
the org can never bill more than the estimate total. The invoice **displays the
estimate's line-item breakdown prorated** by that ratio (matching the
QuickBooks-style deposit invoice the customer provided as a reference) and is
**customer-facing**: a public token page plus an email, mirroring the existing
estimate-review flow.

Payments are **recorded manually** for now (check / cash / card-elsewhere), but
the data model is built as a **payment ledger** so online **Stripe** payment
drops in later with no schema rework. Invoices are managed **under the estimate
detail page** (no top-level nav in this phase).

## Decisions (locked)

| Question | Decision |
|---|---|
| Invoice origin | **Multiple invoices per estimate** (staged billing) |
| Amount basis | **Free-form** — $ or % of estimate total, with running-balance over-bill guard |
| Payment collection | **Manual now**, ledger model so **Stripe** drops in later |
| Delivery | **Customer-facing** — public token page + email |
| Invoice content | Bill an aggregate amount; **display estimate lines prorated** by ratio |
| Management surface | **Under the estimate detail page** (no top-level nav yet) |
| Creation gate | **Any estimate with a non-null total** (line items); no hard approval requirement |
| Proration base | **Full estimate-view breakdown** (lines + markup + convenience fee), reconciled to bill amount; fee/markup rows render only when non-zero |
| Money type | **`Float`** dollars, matching existing codebase convention; convert to integer **cents only at the Stripe boundary** |
| Logo hosting | **Deferred (phase 2)** — model carries a `logoUrl`; upload/hosting mechanism (Vercel Blob / pasted URL / app-served) decided later |

## Domain placement

Extends the core chain:

```
Customer → Location → SiteMeasure → Estimate → Invoice → Payment
```

An `Invoice` belongs to one `Estimate` (and is org-scoped like everything else).
A `Payment` belongs to one `Invoice`. An append-only `InvoiceEvent` log mirrors
`EstimateEvent` for audit parity.

## Data model

New Prisma models (PostgreSQL). All new `NOT NULL` columns carry defaults and all
new tables start empty, so `prisma migrate deploy` will not trip the `23502`
failure mode on the populated Neon PR branch.

```prisma
model Invoice {
  id            Int          @id @default(autoincrement())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  estimateId    Int
  estimate      Estimate     @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  invoiceNumber Int

  status        String       @default("draft") // draft | sent | viewed | partial | paid | void

  // What this invoice bills — an aggregate against the estimate total
  amount        Float                  // dollars owed on THIS invoice
  pct           Float?                 // set when billed as a % of estimate total; null for flat $
  memo          String?                // "Deposit", "Progress payment", …

  // Customer-facing text (per-invoice, defaulted from the org / estimate)
  coverNote           String @default("") // email greeting/body
  terms               String @default("") // e.g. "50% to schedule, bal upon compl"; defaults from Estimate.terms
  paymentInstructions String @default("") // the "WARNING! cards via link / check to…" block

  date          DateTime     @default(now())
  dueDate       DateTime?

  // Public delivery — mirrors Estimate's send flow
  publicToken   String?      @unique
  sentAt        DateTime?
  sentToEmail   String?
  sentByEmail   String?
  sentByName    String?
  viewedAt      DateTime?

  // Payment state — derived from Payment rows, stamped here for fast list/sort
  paidAt        DateTime?
  voidedAt      DateTime?

  // Stripe seam — unused until the online-payment phase
  stripePaymentLinkUrl  String?
  stripePaymentIntentId String? @unique

  // Self-contained copy of what the customer saw (estimate view + identity + logoUrl)
  snapshot      Json?

  createdAt     DateTime     @default(now())

  payments      Payment[]
  invoiceEvents InvoiceEvent[]

  @@index([orgId])
  @@index([estimateId])
  @@unique([orgId, invoiceNumber])
}

model Payment {
  id              Int      @id @default(autoincrement())
  invoiceId       Int
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  amount          Float
  method          String   // check | cash | card | ach | stripe | other
  paidAt          DateTime @default(now())
  reference       String?  // check #, etc.
  note            String?
  recordedByEmail String?  // who recorded it (manual); null for Stripe-driven rows
  recordedByName  String?

  stripeChargeId  String?  @unique  // Stripe seam

  createdAt       DateTime @default(now())

  @@index([invoiceId])
}

model InvoiceEvent {
  id         Int      @id @default(autoincrement())
  invoiceId  Int
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  type       String   // sent | viewed | resent | link_rotated | payment_recorded | voided
  actorEmail String?
  actorName  String?
  ip         String?
  userAgent  String?
  metadata   Json?
  source     String?  // customer | builder | system
  createdAt  DateTime @default(now())

  @@index([invoiceId, createdAt])
}
```

Additions to existing models:

```prisma
// Organization
  nextInvoiceNumber          Int      @default(1)
  defaultPaymentInstructions String   @default("")
  stripeConnectAccountId     String?  // phase-2: collect customer payments on the org's behalf
  invoices                   Invoice[]

// Estimate
  invoices  Invoice[]
```

### Migration safety

- Both new `Organization` columns (`nextInvoiceNumber`, `defaultPaymentInstructions`)
  have `DEFAULT`s; `stripeConnectAccountId` is nullable. New tables are empty.
  → no `23502` on the populated Neon PR branch.
- Add as a new migration on top of existing ones (never squash — squashing breaks
  the `migrate deploy` at Vercel deploy time).

## Lifecycle & status

```
draft → sent → viewed → partial → paid
   └──────────────┴─────────┴────── void (terminal cancel; excluded from balances)
```

- **draft** — created, fully editable (amount/pct, memo, terms, due date, cover
  note). Not customer-visible.
- **sent** — `publicToken` generated, **snapshot captured**, `sentAt` stamped,
  `InvoiceEvent(sent|resent)`. Billed amount + lines **freeze** (customer has now
  seen a figure). After send the invoice is read-only except for these actions:
  resend, rotate link, record payment, void. Any field edit → `INVOICE_LOCKED`.
- **viewed** — customer opened the public page; `viewedAt` + `InvoiceEvent(viewed)`.
  Only flips `sent → viewed`; always logs the open.
- **partial / paid** — derived from the payment ledger:
  `0 < Σpayments < amount` → `partial`; `Σpayments ≥ amount` → `paid` (`paidAt`
  stamped). Recomputed on every `recordPayment`.
- **void** — terminal cancel; `voidedAt` stamped; removed from
  `invoiced` / balance math.

## Balance & proration math — `lib/invoices/` (pure)

Single source of truth, in the spirit of `computeEstimateView` (and consistent
with the labeled-breakdown invariant in CONTEXT.md).

**Estimate billing summary**

```
total       = estimate.total                     // computeEstimateView().total
invoiced    = Σ invoice.amount where status != 'void'
unbilled    = total − invoiced
paid        = Σ payment.amount across non-void invoices
outstanding = invoiced − paid
```

The create/edit guard rejects `amount > unbilled` → `INVOICE_OVERBILL`. When the
user enters a percentage, `amount = round(total × pct, 2)` then the same guard
applies.

**Proration for display**

```
ratio = amount / total
for each row in estimateView breakdown (line subtotals + markup + convenienceFee):
    rowAmount = round(row.value × ratio, 2)
reconcile: adjust the last row so Σ rowAmount == amount   // largest-remainder / last-row fix
```

Markup and convenience-fee rows render only when non-zero — so a fee/markup-free
estimate yields the clean "lines only → Balance due" layout from the reference
invoice, and when they exist the breakdown still reconciles exactly to the billed
amount (money is never hidden).

## Snapshot

Reuses the `snapshotEstimate` (`lib/estimateView/snapshot.ts`) pattern. On
**send**, freeze a JSON record onto `invoice.snapshot`:

```
{
  invoiceNumber, date, dueDate, memo, terms, pct, amount, paymentInstructions,
  customer: { name, address, email, phone },
  org:      { name, phone, address, licenseNumber, logoUrl },
  lines:    [ { name, description, amount } ],   // prorated, reconciled to amount
  totals:   { subtotal, markup, convenienceFee, balanceDue }
}
```

Email and public page read from the snapshot once sent (live-computed preview
before send). Immutable even if the estimate is later revised or the org rebrands
(captures the logo URL too).

## Repositories — `lib/repositories/`

`invoiceRepo.ts` (payments + events folded in), exported via `index.ts`. All
org-scoped, all using `prisma.$transaction` where multi-step:

- `listInvoicesForEstimate(estimateId, orgId)`
- `getInvoice(id, orgId)` — with `payments`, `invoiceEvents`
- `createInvoice(orgId, { estimateId, amount | pct, memo, terms, dueDate, coverNote })`
  — assigns `nextInvoiceNumber` (increment in txn), applies over-bill guard,
  defaults `terms` from the estimate and `paymentInstructions` from the org.
- `updateInvoice(id, orgId, patch)` — **draft-only**; throws `INVOICE_LOCKED` otherwise.
- `voidInvoice(id, orgId)`
- `markInvoiceSent(id, orgId, input)` — generates token (`randomBytes(32).base64url`),
  builds + stores snapshot, stamps `sentAt`, logs `sent`/`resent`.
- `markInvoiceViewed(invoiceId, input)` — public; flips `sent → viewed`, logs open.
- `recordPayment(invoiceId, orgId, { amount, method, paidAt, reference, note, recordedBy })`
  — appends `Payment`, recomputes `status` + `paidAt`, logs `payment_recorded`.
- `getInvoiceByToken(token)` — public read (no org scope; token authorizes).
- `rotateInvoiceToken(id, orgId)`

## API routes

Org-scoped (`apiRoute`):

- `GET  /api/estimates/[id]/invoices` — list for an estimate
- `POST /api/estimates/[id]/invoices` — create
- `GET  /api/invoices/[id]` — detail
- `PATCH /api/invoices/[id]` — edit draft
- `POST /api/invoices/[id]/send` — render + send email (mirrors `estimates/[id]/send`)
- `POST /api/invoices/[id]/void`
- `POST /api/invoices/[id]/payments` — record a manual payment

Public (`publicRoute`):

- Page loader via `getInvoiceByToken` + `markInvoiceViewed`.
- **Stripe (phase 2, stubbed seam):** `POST /api/invoice-review/[token]/pay` →
  Stripe Checkout session; `POST /api/stripe/invoice-webhook` → writes a
  `Payment` row. `stripePaymentLinkUrl` renders on the public page when present.

New domain error codes (via `lib/api/errors.ts` `ApiError` subclasses):

- `INVOICE_LOCKED` (409) — edit attempted after send.
- `INVOICE_OVERBILL` (409) — amount exceeds the estimate's unbilled balance.

## Public pay page — `app/invoice-review/[token]/page.tsx`

Mirrors `app/estimate-review/[token]/page.tsx`, reusing the `Letterhead` /
`PublicEstimateView` styling. Sections: header (logo + org), **Bill to**,
**Terms**, prorated line breakdown, **Balance due**, payment-instructions block,
and a **Pay** button (Stripe link when configured) + **Print / save**. No
approve/decline — invoices are paid, not approved.

## Estimate-detail UI — `app/(app)/estimates/[id]/page.tsx`

A new **Invoices** section:

- **Billing summary strip:** Total / Invoiced / Unbilled / Paid / Outstanding.
- **New invoice** action: enter `$` *or* `%` (estimate `depositPct` pre-filled),
  memo, terms (pre-filled from estimate), due date, cover note. Available whenever
  the estimate has a non-null total.
- **Per-row actions:** Send, Record payment, Open public page, Void. Row shows
  number, memo, amount, status, due date, paid-to-date.

## Email — `lib/email/`

`CustomerInvoiceEmail.tsx` + `sendInvoiceEmail.ts`, modeled on the estimate
equivalents. Renders logo (`<Img src={snapshot.org.logoUrl}>`), greeting,
cover note, due date, headline amount, prorated line list, terms, payment
instructions, the Stripe pay link (when present), and a **Pay / view invoice**
button. Footer: "Powered by SqFt".

## Reference-email coverage

The customer's QuickBooks deposit-invoice example maps fully onto this model:

| Email element | Source |
|---|---|
| Company logo | `snapshot.org.logoUrl` (`org.logo`) |
| Company name | `org.name` |
| "INVOICE 7465" | `invoice.invoiceNumber` |
| "DUE 06/06/2026" | `invoice.dueDate` |
| **$7,403.50** headline / "Balance due" | `invoice.amount` |
| "Dear Alex," | `snapshot.customer.name` |
| "Your **Deposit** invoice…" cover text | `invoice.coverNote` + `invoice.memo = "Deposit"` |
| Payment link (×2) | `invoice.stripePaymentLinkUrl` |
| "Bill to" address block | `snapshot.customer` |
| "Terms — 50% to schedule, bal upon compl" | `invoice.terms` |
| Prorated line items | `snapshot.lines` (each `estimateLine × ratio`) |
| WARNING / check-mailing block | `invoice.paymentInstructions` |
| "Powered by QuickBooks" | "Powered by SqFt" footer |

## Out of scope (this phase)

- Online Stripe payment execution (checkout session + webhook). Seam is in place
  (`stripePaymentLinkUrl`, `stripeChargeId`, `stripeConnectAccountId`, ledger).
- Logo upload / hosting mechanism (Vercel Blob vs pasted URL vs app-served).
- Top-level "Invoices" nav / cross-estimate AR dashboard.
- PDF generation (the public page is print/save-able; a dedicated PDF can follow).

## Testing (per AGENTS.md)

- `prisma/seed.ts` updated with sample invoices + payments across statuses
  (draft / sent / partial / paid / void).
- Unit: proration + reconciliation math, billing-summary math, over-bill guard,
  payment-driven status transitions.
- API: create (with guard), send (snapshot capture), record-payment, void,
  public token read + view-tracking.
- `biome ci .` clean; full suite green before handoff.
