# Splitting Quotes out of Estimates

**Date:** 2026-05-08
**Status:** Approved (brainstorming)

## Goal

Today an `Estimate` carries both the site measure (rooms) and the priced quote (line items, tax, markup, deposit, status, approval token). The new design — driven by `design/SqFt - App.html` — separates these concerns:

- **Estimate** = measurement only. One per project / site visit.
- **Quote** = priced proposal. One Estimate can have many Quotes (revisions, alternate materials, declined-then-replaced).
- **Job-type Event** = installation work. Must tie to a specific Quote (the priced version that won the job), not to an Estimate.

## Decisions

The brainstorming session settled these branches:

- **Migration:** destructive full reset. Wipe estimates, line items, events, and the related counters. No backfill of existing data.
- **Field allocation:** all pricing-shaped fields move from Estimate → Quote (`taxRate`, `markupPct`, `depositPct`, `lineItems`, `quoteNumber`, `approvalToken`, status).
- **Estimate.status:** dropped. Lifecycle is derivable from tied Quote(s) and Events.
- **Event link:** drop `Event.estimateId`; add `Event.quoteId`. Required when `type === "job"`. Reach the estimate via `quote.estimateId` when needed.
- **Numbering:** two org-wide counters on `Organization`. `nextEstimateNumber` for estimates; existing `nextQuoteNumber` continues for quotes.
- **Quote defaults:** new quotes start as empty drafts (no line items copied from siblings).
- **Scope of this work:** schema + repos + API + minimal UI wiring so the existing pages don't break. The new top-level Quotes list, Quote builder polish, event-panel quote-picker, and the redesigned Quote Viewer are deferred to follow-up work.

## Schema

### `Organization`

- Add `nextEstimateNumber Int @default(1)`.
- Keep `nextQuoteNumber Int @default(1)` (now used for `Quote.quoteNumber`).
- Back-relations: keep `estimates Estimate[]`, keep `events Event[]`, add `quotes Quote[]`.

### `Estimate`

- **Add:** `estimateNumber Int?` — allocated on create from `Organization.nextEstimateNumber`.
- **Remove:** `status`, `quoteNumber`, `taxRate`, `markupPct`, `depositPct`, `approvalToken`.
- **Keep:** `id`, `orgId`, `customerId`, `title`, `date`, `createdAt`.
- **Relations:** `customer`, `items` (rooms), and a new `quotes Quote[]`.
- **Drop relations:** `lineItems`, `events`.

### `Quote` (new)

```prisma
model Quote {
  id            Int      @id @default(autoincrement())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  estimateId    Int
  estimate      Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  quoteNumber   Int      // org-wide
  status        String   @default("draft") // draft | sent | accepted | declined
  date          DateTime @default(now())
  taxRate       Float    @default(0.08)
  markupPct     Float    @default(0)
  depositPct    Float    @default(0.50)
  approvalToken String?  @unique
  createdAt     DateTime @default(now())

  lineItems     LineItem[]
  events        Event[]
}
```

`orgId` is denormalized (also reachable via `estimate.orgId`) so tenant-scoped queries don't have to join.

### `LineItem`

- Foreign key changes from `estimateId` → `quoteId` (cascade on quote delete).
- Other fields unchanged.

### `Event`

- **Drop:** `estimateId` and the relation to `Estimate`.
- **Add:** `quoteId Int?` with `@relation(... onDelete: SetNull)`.
- App-level invariant (enforced in Zod and the repository, not in Postgres): `type === "job"` requires non-null `quoteId`.

### Edge case: deleting a quote with tied job events

`Event.quoteId` uses `onDelete: SetNull`, but the app-level invariant says `type === "job"` requires a non-null `quoteId`. Naively deleting a quote would orphan its job events into an invalid state.

`deleteQuote` therefore checks first: if any `Event` rows reference this `quoteId`, refuse the delete and return a 409. The UI surfaces this as "Reassign or delete the X scheduled jobs for this quote first."

### Migration

- Single Prisma migration named e.g. `add_quote_split`.
- Drop affected columns from `Estimate`.
- Delete all rows in `Estimate`, `EstimateItem`, `LineItem`, `Event` (destructive, per decision).
- Reset `Organization.nextQuoteNumber` to 1; add `nextEstimateNumber Int @default(1)`.
- Create `Quote`.
- Add `LineItem.quoteId` (FK to Quote, NOT NULL); drop `LineItem.estimateId`.
- Add `Event.quoteId` (FK, nullable); drop `Event.estimateId`.
- Update `prisma/seed.ts` to seed estimates with rooms only, then quotes with line items, then events with `quoteId` for jobs.

## Repositories

### New: `lib/repositories/quoteRepo.ts`

- `listQuotes(orgId, filters?)` — for the (deferred) org-wide Quotes list. Filters: `status`, `search` (matches quote#, estimate#, customer name).
- `listQuotesForEstimate(estimateId, orgId)` — feeds the `est-quotes-card` on the Estimate Builder.
- `getQuote(id, orgId)` — returns the quote with `lineItems`, plus `estimate.customer` and `estimate.items` (rooms are needed by the builder for room-linked line items).
- `createQuote(orgId, { estimateId })` — verifies the estimate belongs to the org, then in one transaction allocates the next `quoteNumber` from `Organization.nextQuoteNumber` and inserts an empty draft (`lineItems: []`, `taxRate: 0.08`, `markupPct: 0`, `depositPct: 0.50`, `status: "draft"`).
- `saveQuote(id, orgId, patch)` — same shape as today's `saveEstimate`: replaces `lineItems` wholesale; updates pricing/status/title fields.
- `deleteQuote(id, orgId)`.
- `rotateApprovalToken(id, orgId)` — moved from `estimateRepo`. Generates a base64url token and assigns it to the quote.
- `getQuoteByToken(token)` — moved from `estimateRepo`. Returns the quote with `lineItems`, `estimate.customer`, `estimate.items`, and `org` branding (`name`, `phone`, `address`, `licenseNumber`, `logo`) — everything `PublicQuoteView` needs.

### Changes: `lib/repositories/estimateRepo.ts`

- `EstimateWithDetails` no longer includes `lineItems`. Add a lightweight `quotes` include (`id`, `quoteNumber`, `status`, `date`).
- `createEstimate` allocates `estimateNumber` from `Organization.nextEstimateNumber` (replaces today's `quoteNumber` allocation).
- `EstimatePatch` drops `status`, `taxRate`, `markupPct`, `depositPct`, `lineItems`.
- Remove `rotateApprovalToken` and `getEstimateByToken`.

### Changes: `lib/repositories/eventRepo.ts`

- All references to `estimateId` become `quoteId`.
- `createEvent` and `saveEvent` enforce the job-needs-quote invariant: throw a typed error (e.g. `class EventValidationError extends Error`) when `type === "job"` and `quoteId` is missing/null. The API layer maps it to a 400.

## API

### New routes

- `app/api/quotes/route.ts` — `GET` (list, scoped to org), `POST` (`{ estimateId: number }`).
- `app/api/quotes/[id]/route.ts` — `GET`, `PATCH` (line items + pricing + status + title), `DELETE`.
- `app/api/quotes/[id]/approval-token/route.ts` — rotates a quote's approval token.

### Changed routes

- `app/api/estimates/route.ts` — `createSchema` drops `taxRate`, `markupPct`, `depositPct`. Estimate creation only takes `customerId` and `title`.
- `app/api/estimates/[id]/route.ts` — `PATCH` schema drops pricing/status fields. `GET` response includes the `quotes` summary.
- `app/api/events/route.ts` and `app/api/events/[id]/route.ts` — replace `estimateId` field with `quoteId`. Reject `type === "job"` without `quoteId` (400 with a clear message).

### Removed route

- `app/api/estimates/[id]/approval-token/route.ts` (moved to quotes).

## Public Quote Viewer

`app/q/[token]/page.tsx` and `components/estimates/PublicQuoteView.tsx` are repointed to Quote:

- Token resolution uses `getQuoteByToken`.
- The view pulls rooms from `quote.estimate.items`, line items from `quote.lineItems`, customer from `quote.estimate.customer`, and branding from `quote.org`.
- Rendering layout stays as it is today; this is a data-source swap. The full visual redesign in `design/SqFt - Quote Viewer.html` is a separate, deferred project.

## In-app UI wiring

### Estimate Builder (`components/estimates/EstimateBuilder.tsx`)

- Remove: line items section, pricing summary, share-link / approval UI, status controls.
- Add a "Quotes for this estimate" card matching `design/SqFt - App.html`'s `est-quotes-card`: list of tied quotes with quote #, total, line-item count, status pill, and a click-through to the quote builder. Empty state: "No quotes yet — create one to start pricing."
- Header `+ Create Quote` button: POST `/api/quotes` with the active `estimateId`, then navigate to `/quotes/[newId]`.

### Quote Builder (new, minimal)

- Route: `app/(app)/quotes/[id]/page.tsx`.
- Component: `components/quotes/QuoteBuilder.tsx`. Reuses the existing `LineItemSection` (rewired to the quote API) and `QuoteSummary` (math unchanged: subtotal → tax → markup-on-subtotal+tax → total).
- Header shows tied estimate # + customer; "← Back to estimate" link.
- Send-to-customer / share-link UI rotates the quote's `approvalToken`.

### Deferred (follow-up work, NOT in this slice)

- Top-level `/quotes` list page and "Quotes" nav tab.
- Event panel quote-picker UI for `type=job` events.
- Quote Viewer visual redesign from `design/SqFt - Quote Viewer.html`.

## Tests

### Unit / repo

- Update `__tests__/repositories/estimateRepo.test.ts`: drop assertions on pricing/status/approvalToken fields; assert that creating an estimate allocates the next `estimateNumber`.
- New `__tests__/repositories/quoteRepo.test.ts`:
  - `createQuote` allocates the next `quoteNumber` and rejects when the estimate is in another org
  - `saveQuote` replaces line items wholesale
  - `rotateApprovalToken` and `getQuoteByToken` round-trip a token
  - `listQuotesForEstimate` is org-scoped

### API

- New `__tests__/api/quotes.test.ts`:
  - `POST` requires `estimateId` and verifies tenant scoping
  - `PATCH` validates pricing fields and replaces line items
  - `DELETE` cascades line items
- Update `__tests__/api/estimates.test.ts`: remove pricing fields from the create body; assert response includes `quotes`.
- Update `__tests__/api/events.test.ts`: `type=job` without `quoteId` → 400; `visit`/`other` work without `quoteId`.

### E2E (`tests/e2e`)

- Update existing estimate-builder e2e tests to expect the new "Quotes" card and absence of pricing UI.
- Add a smoke test: open estimate → click "+ Create Quote" → land on quote builder → add a line item → refresh → line item persists.
- Update any e2e that exercised `/q/[token]` so it creates a quote-keyed token (since estimate-keyed tokens no longer exist).

## Verification before completion

Per `AGENTS.md`:

1. `biome ci .` passes with no errors.
2. `prisma migrate dev` runs cleanly on a fresh DB; `prisma/seed.ts` populates without error.
3. `vitest run` passes.
4. `playwright test` passes.

## Out of scope

- Top-level Quotes list page and nav tab.
- Event panel quote-picker UI.
- Public Quote Viewer visual redesign (`design/SqFt - Quote Viewer.html`).
- Quote duplication / "create from previous quote".
- Per-estimate revision numbering (Q1, Q2, …) — quotes use the org-wide sequence.
