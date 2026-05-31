# Estimates / Site Measures Remodel — Design

**Date:** 2026-05-29
**Status:** Approved for planning
**Stage:** Pre-launch (disposable data — clean restructure permitted)

## Motivation

The current model named things wrong relative to how shops actually work:

- What the code calls a **Quote** is really an **Estimate**. It should not require
  a drawn signature — only a lightweight customer **approval** that they are ready
  to move forward / get on the schedule.
- What the code calls an **Estimate** (a set of room measurements/notes) is really
  a **Site Measure**, and a site measure happens at a **house address (location)**.
- A customer can have work at more than one address, and a single address can have
  more than one site measure over time. There is no first-class "location" today.

This spec renames the domain end-to-end, introduces a `Location` entity, and
replaces the signature apparatus with one-click approval.

## Domain Model

New ownership chain (1 → many downward):

```
Organization
  └─ Customer            (person/company you bill; address column REMOVED)
       └─ Location        NEW — a house address; one customer, never shared/transferred
            └─ SiteMeasure        (was Estimate) — rooms/notes; belongs to a Location
                 ├─ SiteMeasureItem   (was EstimateItem) — room (shape/w/l) or note
                 └─ Estimate          (was Quote) — priced doc, approval workflow
                      └─ LineItem      — links to SiteMeasureItem ids for area/perimeter qty
```

### Entities

**Location** (new)
- `id`, `orgId`, `customerId` (required — belongs to exactly one customer)
- `address` (string), `label` (optional, e.g. "Rental – 12 Oak St"), `notes` (optional)
- A location is never shared between customers and is not transferable.

**SiteMeasure** (was `Estimate`)
- Belongs to a `Location` (`locationId`). **No direct `customerId`** — the customer
  is resolved via `siteMeasure.location.customer`, giving one source of truth.
- Keeps today's fields: `title`, a per-site-measure number (`siteMeasureNumber`,
  was `estimateNumber`), `date`.
- Owns `SiteMeasureItem[]` and `Estimate[]`.

**SiteMeasureItem** (was `EstimateItem`)
- Unchanged in shape: `type` (`room` | `note`), room fields (`name`, `shape`, `w`,
  `l`, `note`), note field (`text`), `sortOrder`.
- `LineItem.linkedRoomIds` references `SiteMeasureItem` ids (renamed concept, same FK).

**Estimate** (was `Quote`)
- Priced document. Keeps `estimateNumber` (was `quoteNumber`), `status`,
  `approvalToken`, pricing fields (`convenienceFeeRate`, `markupPct`, `depositPct`,
  `terms`, `validityDays`), send metadata, and the **revision chain**
  (`revisedFromId` / `revisedBy`).
- Belongs to a `SiteMeasure` (`siteMeasureId`, was `estimateId`).
- Owns `LineItem[]`, `EstimateEvent[]`, and an optional `EstimateApproval`.

**EstimateApproval** (new — replaces `QuoteSignature`)
- `estimateId` (unique), `approvedAt`, `ip`, `userAgent`, `snapshot` (JSON).
- The snapshot is the computed `EstimateView` of the approved version, so a later
  edit cannot silently change what the customer agreed to.
- **Dropped from the old model:** drawn-signature PNG, consent text, `signedByName`/
  `signedByEmail`, and the `snapshotHash` tamper-evidence. The snapshot is **not**
  hashed/canonicalized.

**EstimateEvent** (was `QuoteEvent`)
- Audit log. `type` values rename `accepted` → `approved`; the rest
  (`sent`, `viewed`, `declined`, `link_rotated`, `resent`, `revised_from`) carry over.

**Event** (scheduling) — shape unchanged
- `quoteId` → `estimateId`; still also carries `customerId`.
- Scheduling is **not** gated by estimate status (see Lifecycle).

**Unchanged:** `Organization`, `User`, `CrewMember`, `LineItemTemplate`.

**Removed:** `Customer.address` column; `QuoteSignature` model.

## Lifecycle & Approval

Status flow (renamed, otherwise identical to today's quote workflow):

```
draft → sent → viewed → approved      (terminal, locked)
                      ↘ declined        (terminal, locked)
```

**Customer-facing approval** (public page, no login):
- Read-only priced estimate (line items, totals, deposit).
- One primary button: **"Approve & get on the schedule."** No name typed, no
  signature drawn.
- Secondary **Decline** action with optional reason (unchanged from today).

**On approval (server):**
1. Set `status = approved`, stamp `approvedAt`.
2. Write one `EstimateApproval` row: `ip`, `userAgent`, JSON `snapshot` of the
   approved `EstimateView`.
3. Log an `EstimateEvent` (`approved`, source = customer).
4. **Lock** the estimate — further edits require **Revise**, which clones it into a
   fresh `draft` linked back via `revisedFromId`.

**Decoupling:** approval is informational only. Scheduling (Events) and future
invoicing work regardless of estimate status — an estimate need **not** be approved
to put a customer on the schedule or invoice them.

**Revision:** Revise clones an `approved` or `declined` estimate into a new `draft`.
The new estimate runs its own `draft → sent → viewed → approved` cycle. The original
retains its terminal status as the historical record.

**Deferred (not in this spec):** notifying org admins on approval.

## Rename Map

### Models / columns

| Today | Becomes |
|---|---|
| `Quote` | `Estimate` |
| `Estimate` | `SiteMeasure` |
| `EstimateItem` | `SiteMeasureItem` |
| `QuoteSignature` | `EstimateApproval` (gutted — see above) |
| `QuoteEvent` | `EstimateEvent` (`accepted` → `approved`) |
| `Quote.quoteNumber` | `Estimate.estimateNumber` |
| `Estimate.estimateNumber` | `SiteMeasure.siteMeasureNumber` |
| `Quote.estimateId` | `Estimate.siteMeasureId` |
| — | `Location` (new) |
| `Customer.address` | removed |

### Routes / modules (collision-prone — see strategy)

| Today | Becomes |
|---|---|
| `app/(app)/quotes/` | `app/(app)/estimates/` |
| `app/(app)/estimates/` | `app/(app)/site-measures/` |
| `app/api/quotes/` | `app/api/estimates/` |
| `app/api/estimates/` | `app/api/site-measures/` |
| `app/q/[token]/` (public) | `app/estimate-review/[token]/` |
| `app/api/q/[token]/accept` | `app/api/estimate-review/[token]/approve` |
| `lib/quoteView/` | `lib/estimateView/` |
| `lib/quotes/`, `lib/quoteStatus.ts` | `lib/estimates/`, `lib/estimateStatus.ts` |
| `lib/estimates/` | `lib/siteMeasures/` |
| `lib/repositories/quoteRepo.ts` | `lib/repositories/estimateRepo.ts` |
| `lib/repositories/quoteSignatureRepo.ts` | `lib/repositories/estimateApprovalRepo.ts` |
| `components/quotes/`, `components/estimates/PublicQuoteView.tsx`, `components/estimates/public-quote/` | `components/estimates/` (priced) |
| `components/estimates/` (builder/list) | `components/siteMeasures/` |
| `lib/hooks/useQuotes.ts` | `lib/hooks/useEstimates.ts` |

**Customer-facing word:** customers read **"Estimate"** everywhere (emails, buttons,
the `/estimate-review/[token]` page). "Quote" is retired from user-facing copy.

**Deleted outright:** `components/estimates/public-quote/SignaturePad.tsx`,
`PublicQuoteSignedView.tsx`, the signed page `app/(app)/quotes/[id]/signed/`, and the
snapshot-hash / `canonicalize` tamper-evidence code.

### Collision strategy

Because the swap reuses the word "Estimate" for a different concept, target folders
are occupied. Rename in order so the destination is always free:

1. **Estimate → SiteMeasure** (current estimates code/routes/tests move to
   `site-measures` / `siteMeasures`).
2. **Quote → Estimate** (current quotes code/routes/tests move into the now-free
   `estimates` namespace).

Update `CONTEXT.md` (the "Quote View" glossary section becomes "Estimate View"; add
`Location` and `SiteMeasure`; drop signature/snapshot-hash language) and the API error
codes (`QUOTE_LOCKED` → `ESTIMATE_LOCKED`, `QUOTE_HAS_EVENTS` → `ESTIMATE_HAS_EVENTS`,
`EMAIL_FAILED` copy) in the same pass.

## Migration & Seed

Pre-launch with disposable data → clean restructure, no backfill gymnastics.

- **Schema:** rewrite `prisma/schema.prisma` to the target model above.
- **Migrations:** **squash** the existing migration history into a single fresh
  baseline migration that reflects the new schema. None of the current migrations
  describe data worth preserving, and expressing a swap-rename as an incremental diff
  would be needlessly fragile.
- **Seed (`prisma/seed.ts`):** rebuild to exercise the new shape —
  - a customer with **multiple Locations**;
  - a Location with **multiple SiteMeasures**;
  - SiteMeasures with multiple Estimates across statuses, including at least one
    **approved** (with its `EstimateApproval` row + snapshot), one **declined**, and
    one **revision chain** (revised draft linked to predecessor);
  - Events scheduled against estimates that are **not** approved (proves decoupling).
- **Target database:** the dev Neon DB referenced by the worktree `.env`
  (`ep-billowing-fire-...`). The production DB in `.env.prd.local`
  (`ep-holy-credit-...`) is **never** touched by migrations or seed.

## Testing & Verification

Tests follow the same swap as the code; signature tests are retired.

**Renamed/migrated:** `quote-*` e2e specs → `estimate-*`; current `estimate-*` e2e →
`site-measure-*`; unit `quotes.test`/`quoteView/*`/`quoteRepo`/`quoteEventRepo`/
`reviseQuote`/`saveQuote-locked`/`acceptQuoteByToken-siblings` renamed to their
estimate equivalents; current `estimates.test` → `site-measures.test`.

**Rewritten in substance:**
- `quoteView/snapshot.test.ts` → drops hash/canonicalize; verifies the approval
  snapshot captures the correct `EstimateView`.
- `quoteSignatureRepo.test.ts` → `estimateApprovalRepo.test.ts`: approval writes
  `status` + `approvedAt` + `ip`/`userAgent` + snapshot, with **no** signature/consent.
- `quote-accept-decline` → one-click approve: no `SignaturePad`, button →
  `approved`, lock applied.

**New coverage:**
- A customer with multiple locations; a location with multiple site measures.
- A site measure resolves its customer via Location.
- Scheduling an Event against a non-approved estimate succeeds (approval does not gate).
- No `Customer.address` references leak anywhere.

**Deleted:** SignaturePad tests, signed-view tests.

**Gates before "done":**
- `biome ci .` clean
- `vitest run` green
- `playwright test` green
- `npm run seed` succeeds against the dev schema

## Out of Scope

- **Stripe / billing** — billing address and payment live in Stripe (future);
  `Customer.address` is removed rather than repurposed as a billing field.
- **Admin notifications on approval** — deferred.
- Any change to crew/scheduling beyond the `quoteId → estimateId` rename.
