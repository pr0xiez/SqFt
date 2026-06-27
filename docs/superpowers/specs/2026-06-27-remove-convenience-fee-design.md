# Remove the convenience fee

**Status:** approved
**Date:** 2026-06-27

## Background

SqFt currently applies a per-estimate **convenience fee**: a
`Estimate.convenienceFeeRate` (decimal, default `0.03`) charged on
`subtotal + markup` and surfaced as its own customer-facing row on estimates
and invoices. It is *not* an org-level setting — every estimate is created with
a hard-coded `0.03`.

The business is retiring the always-on convenience fee. It will eventually be
replaced by a **payment-method surcharge** (charged only when a customer pays
by credit card or bank). That surcharge is a separate feature with its own
design — **out of scope here**. This spec covers only the clean *removal* of
the convenience fee.

## Decisions (settled during brainstorming)

1. **Sequencing:** remove the convenience fee now; design the card/bank
   surcharge as a separate spec later.
2. **Existing data:** the database holds mostly test/seed data plus a handful of
   throwaway records — no real customer invoices depend on the fee. Therefore
   **no retroactive financial migration**: we do not rewrite already-created
   invoice amounts, payment records, or frozen invoice snapshots. Going forward,
   no estimate or invoice ever carries a convenience fee.
3. **Accepted limitation:** a few pre-existing test invoices may keep a
   convenience-fee row baked into their frozen `Invoice.snapshot` JSON and a
   fee-inflated `Invoice.amount`. This is acceptable for throwaway data and is
   not worth a data migration. Extra fields in old snapshot JSON are harmless —
   the renderer reads the frozen `lines`/`totals` it finds; new snapshots simply
   won't contain a fee row.

## Goal

Eliminate the convenience fee as a concept across math, draft/edit, API, UI,
schema, docs, seed, and tests, so that:

- New estimates compute `total = subtotal + markup` (no fee).
- New invoices prorate with no convenience-fee row.
- There is no convenience-fee input in the estimate editor and no fee row on the
  public estimate/invoice documents.
- The `Estimate.convenienceFeeRate` column is dropped.

## Changes

### 1. Estimate math — `lib/estimateView/`

- `compute.ts`: remove `convenienceFee` and `beforeFee`. New math:
  `markup = subtotal * (markupPct / 100)`, `total = subtotal + markup`,
  `deposit = total * depositPct`.
- `types.ts`: remove `convenienceFeeRate` from `EstimateInput`; remove
  `convenienceFee` (and the now-redundant `beforeFee`, if it was only an
  intermediate) from `EstimateView`. Keep `subtotal`, `markup`, `total`,
  `deposit`, `hasUnresolvedLines`.
- `fromPrisma.ts`: stop mapping `convenienceFeeRate` from the Prisma row.
- `snapshot.ts`: stop reading/writing `convenienceFeeRate` and
  `totals.convenienceFee`.

### 2. Estimate draft / reducer — `lib/estimateDraft/`

- `types.ts`: remove `convenienceFeeRate` from `EstimateDraft` and remove the
  `{ type: "setConvenienceFeeRate"; value: number }` action.
- `reduce.ts`: remove the `setConvenienceFeeRate` case.

### 3. Invoice math — `lib/invoices/`

- `compute.ts` (`prorateInvoice`): delete the block that pushes the
  "Convenience fee" row. The remaining line rows already reconcile to the
  invoice amount via `residualTargetIndex`.
- `types.ts`: remove `convenienceFee` from `InvoiceSnapshot.totals` and remove
  `convenienceFeeLabel` from `ProrationSource`.
- `snapshot.ts`: drop `convenienceFee` from the frozen `totals`.

> `Invoice.amount` is set at creation from `computeEstimateView(...).total`
> (see `computeInvoiceAmount` in `invoiceRepo.ts`). Because `total` no longer
> includes the fee, new invoices are automatically fee-free — no change needed
> in `computeInvoiceAmount` itself.

### 4. API validation — `lib/estimates/schema.ts`

- Remove the `convenienceFeeRate: z.number().min(0).max(1).optional()` field
  from `estimateUpdateSchema`.

### 5. Repository — `lib/repositories/estimateRepo.ts`

- `createEstimate`: remove the hard-coded `convenienceFeeRate: 0.03`.
- `EstimatePatch` / `saveEstimate`: remove `convenienceFeeRate`.
- `syncEstimateTotal` (`HydratedForTotal`): remove `convenienceFeeRate` from the
  shape fed to `computeEstimateView`.

### 6. UI

- `components/estimates/EstimateTotals.tsx`: remove the convenience-fee input
  row, its `feePct`/`feeAmt` props, and the `onCommitFee` handler.
- `components/estimates/LineItemSection.tsx`: remove the `convenienceFeeRate`
  prop pass-through, the `onCommitFee` wiring, and the `setConvenienceFeeRate`
  dispatch.
- `components/estimates/public-estimate/TotalsBlock.tsx`: remove the
  "Convenience fee" row and its `convenienceFeeRate`/`convenienceFee` props
  (totals become Subtotal → Total).
- `app/estimate-review/[token]/page.tsx` and the `PublicEstimate` shape it
  builds: drop `convenienceFeeRate`.

### 7. Schema migration — `prisma/migrations/`

Add a **new** migration on top (never squash existing ones, including
`20260517000000_quote_convenience_fee_rename`):

```sql
-- Keep existing test estimate totals consistent (drop the embedded fee),
-- then remove the column.
UPDATE "Estimate"
SET "total" = "total" / (1 + "convenienceFeeRate")
WHERE "total" IS NOT NULL AND "convenienceFeeRate" <> 0;

ALTER TABLE "Estimate" DROP COLUMN "convenienceFeeRate";
```

Dropping a column is safe on a populated DB (unlike `ADD COLUMN NOT NULL`).
Per the dev environment, this DDL cannot be applied to the shared Neon dev DB
locally (sandbox-blocked); it applies on CI / Vercel `prisma migrate deploy`.
Local validation is via `typecheck` + non-DB unit tests.

### 8. Seed — `prisma/seed.ts`

- Stop setting `convenienceFeeRate` on any seeded estimate.

### 9. Docs — `CONTEXT.md` / `AGENTS.md`

Update (don't just append) the sections that name the convenience fee:

- **Estimate View** — remove `convenienceFee` from the totals list.
- **Estimate Draft** — remove `convenienceFeeRate` from the money fields and the
  decimal/percent note.
- **Markup** — remove the "convenience-fee row is not folded" caveat.
- **Public estimate** bullet — totals become Subtotal → Total.
- **Invoice** — remove "only the convenience fee remains a separate row."
- `AGENTS.md` — remove convenience-fee mentions if any remain after the above.

### 10. Tests

- `__tests__/lib/estimateView/compute.test.ts`: drop the fee assertions; update
  `total` expectations to `subtotal + markup`.
- `__tests__/lib/invoices/compute.test.ts`: remove the fee-row proration test;
  keep rounding-reconciliation coverage.
- `__tests__/lib/estimateDraft/reduce.test.ts`: remove the
  `setConvenienceFeeRate` test.
- `__tests__/api/estimates.[id].test.ts`: remove the `convenienceFeeRate` range
  test.
- Add/adjust at least one assertion confirming a computed estimate `total`
  equals `subtotal + markup` with no fee component.

## Out of scope

- The card/bank **payment-method surcharge** (separate future spec).
- Any retroactive rewrite of existing invoice amounts, payments, or frozen
  snapshots.

## Verification

Before handoff, all green:

- `biome ci .` (lint)
- `npm run typecheck`
- `npm test` (unit + component)

`npm run test:e2e` is unaffected by intent; run if touched UI warrants it
(`--workers=1` locally).
