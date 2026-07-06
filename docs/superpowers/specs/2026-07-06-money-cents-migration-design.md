# Money: Float dollars → integer cents (issue #158)

**Date:** 2026-07-06
**Status:** Approved
**Closes:** #158, #233. Partially addresses: #222 (money-field validation), #215 (snapshot read validation).

## Problem

Money is IEEE-754 float at every layer: five Prisma columns store dollars as
Postgres `Float`, `computeEstimateView` returns unrounded products/sums, and
downstream code papers over the drift with `0.005` epsilons (`nextInvoiceStatus`,
`OVERBILL_EPSILON`) and scattered `round2` calls. Stored `Estimate.total` can
disagree at the penny with a fresh recompute.

## Decision

**Integer cents end-to-end.** The database stores cents as `Int`, the math
layer computes in integer cents, API payloads carry cents, and dollars exist
only at two edges: user keystrokes in, formatted strings out. Chosen over
"cents in DB with repo-boundary conversion" (keeps float math and epsilons
alive) and "no schema change, just round everywhere" (leaves money inexact at
rest).

Sequencing: this lands on `main` **before** the Stripe PR #271 is rescued;
#271 rebases on top (Stripe natively speaks cents, so its boundary conversions
disappear).

## 1. Units and naming

- All money values in app code are **integer cents**. Fields/props/variables
  carrying money use a `Cents` suffix.
- Columns are **renamed with the type change** so every stale access is a
  compile error after `prisma generate` — the type-checker is the migration
  checklist:

  | Old | New |
  |---|---|
  | `LineItem.rate Float` | `LineItem.rateCents Int` |
  | `LineItemTemplate.rate Float` | `LineItemTemplate.rateCents Int` |
  | `Invoice.amount Float` | `Invoice.amountCents Int` |
  | `Payment.amount Float` | `Payment.amountCents Int` |
  | `Estimate.total Float?` | `Estimate.totalCents Int?` |

- API request/response keys and component props rename identically
  (`amount` → `amountCents`, …). The API is consumed only by our own UI and
  react-query hooks; there are no external consumers.
- **Unchanged:** percentage/rate columns (`Estimate.markupPct` 0–100,
  `Estimate.depositPct` 0–1, `LineItem.wastePct` 0–100, `Invoice.pct` 0–1,
  `Organization.defaultDepositPct` 0–1), fractional `qty` (sqft), dimensions
  (`Location.lat/lon`, `SiteMeasureItem.w/l`).

### lib/money.ts (single money home)

- Keep `residualTargetIndex` unchanged (unit-agnostic).
- Add `dollarsToCents(d: number): number` — `Math.round((d + Number.EPSILON) * 100)`.
- Add `centsToDollars(c: number): number` — `c / 100`.
- Add `MAX_MONEY_CENTS` (`2_000_000_000`, ≈$20M) — shared upper bound for Zod
  schemas, protecting the Int4 column from overflow with a clean 400 instead
  of a Postgres error.
- `round2` survives only for dollar-unit work at the snapshot seam.
- Delete the duplicate private `round2` in `lib/repositories/invoiceRepo.ts`.

## 2. Schema migration

One new migration on top of `20260627000000_drop_convenience_fee` (**never
squash** — Vercel runs `prisma migrate deploy`). For each of the five columns:

```sql
ALTER TABLE "LineItem" ALTER COLUMN "rate" TYPE integer USING round("rate" * 100)::integer;
ALTER TABLE "LineItem" RENAME COLUMN "rate" TO "rateCents";
-- …same pattern for LineItemTemplate.rate, Invoice.amount, Payment.amount, Estimate.total
```

Defaults are re-declared as their cents value (`rate` default `0` stays `0`).
No `NOT NULL` additions and every conversion happens in the `USING` clause, so
the migration is safe on the **populated** Neon PR branch. The migration never
touches snapshot JSON.

## 3. Math layer

`computeEstimateView` (`lib/estimateView/compute.ts`) — the SSOT finally
returns rounded, exact integers:

- line `subtotal = Math.round(effectiveQty * li.rateCents)` (`null` stays
  `null` for unresolved lines);
- `subtotal` (estimate) = exact integer sum;
- `markup = Math.round(subtotal * markupPct / 100)`;
- `total = subtotal + markup` (exact);
- `deposit = Math.round(total * depositPct)`.

`EstimateView`, `EstimateInput`, `LineView` types document cents.

- `foldMarkupIntoLines` (`lib/estimateView/markup.ts`): same algorithm; the
  fold factor stays a float ratio, per-line amounts round to integer cents,
  drift reconciliation becomes exact integer arithmetic (no `round2`).
- `prorateInvoice` / `computeEstimateBilling` (`lib/invoices/compute.ts`):
  integer cents in/out; all `round2` calls drop out.
- `nextInvoiceStatus` (`lib/repositories/invoiceRepo.ts`): exact
  `paid >= amountCents`; the `0.005` epsilon is deleted (closes #233 by
  removing both copies).
- `isOverbill` (`lib/invoices/createInvoiceForm.ts`): exact integer compare;
  **`OVERBILL_EPSILON` is deleted.** `deriveInvoiceAmount` returns cents
  (`Math.round(base * pct)` for the percentage modes).
- `reduceEstimateDraft` `commitSubtotal` (`lib/estimateDraft/reduce.ts`):
  back-calculates `rateCents = Math.round(subtotalCents / effectiveQty)`.
  Note: the committed subtotal may differ by ±1¢ from what the user typed once
  recomputed (`round(qty × roundedRate)`), same class of behavior as today but
  now bounded and documented.
- Dashboard (`lib/dashboard/kpis.ts`, `revenue.ts`): integer sums;
  `MONTH_GOAL = 6_500_000` cents.
- `lib/quickCreate/candidates.ts`: inherits cents via `computeEstimateBilling`.

## 4. Validation (API/Zod)

Money fields become strict integers with shared bounds:

- `lib/estimates/schema.ts`: `rateCents: z.number().int().min(0).max(MAX_MONEY_CENTS)`.
  While in the file, `qty` gains `.finite().min(0)` and `wastePct`
  `.finite().min(0)` — closing the money-adjacent half of #222.
- `lib/invoices/schema.ts`: `amountCents: z.number().int().positive().max(MAX_MONEY_CENTS)`
  in create/update and payment schemas; `pct` unchanged.
- `lib/lineItemTemplates/schema.ts`: `rateCents: z.number().int().min(0).max(MAX_MONEY_CENTS)`.
- `app/api/org/route.ts` `defaultDepositPct`: unchanged (a rate, not money).

## 5. UI seams

- **New `components/ui/MoneyInput.tsx`** — thin wrapper around `DecimalInput`
  (`maxDecimals=2`): renders/edits dollars, exposes `valueCents` /
  `onCommitCents`. `DecimalInput` itself stays generic for qty/percent fields.
  All money entry points (line rate, invoice amount, payment amount, template
  rate) switch to it; cents↔dollar conversion lives in exactly one component.
- **`fmtCents(cents)`** added to `lib/utils.ts`; the ~15 `fmtDollar` display
  call sites migrate to it (`EstimateTotals`, `TotalsBlock`, `LineItemsTable`,
  `InvoiceDetail`, `InvoiceList`, `PublicInvoiceView`, `CreateInvoiceDialog`,
  `QuickInvoicePanel`, email senders, …). `fmtBig` → cents equivalent.
- `fmtDollar` survives **only** for rendering frozen dollar snapshots and is
  documented as dollars-only.
- UI money arithmetic (`InvoiceDetail` outstanding, invoice-review balance
  due) becomes exact integer subtraction.

## 6. Snapshots stay dollars

`EstimateApproval.snapshot` and `Invoice.snapshot` are frozen customer-facing
documents — displayed, never computed on (balance due is always live from the
ledger). They **keep dollar units and their current key names** (`rate`,
`amount`, `subtotal`, `total`, `deposit`, `balanceDue`), so old and new
snapshots share one shape and no JSON data migration exists. The missing
`Cents` suffix is itself the unit marker.

- Writers (`lib/estimateView/snapshot.ts`, `lib/invoices/snapshot.ts`) convert
  via `centsToDollars` at freeze time; snapshot types gain explicit
  "dollars" doc comments.
- **New Zod schemas for both snapshot shapes**, validated at every read site
  (`app/invoice-review/[token]/page.tsx`, `components/invoices/InvoiceDetail.tsx`,
  any approval-snapshot reader). The `as unknown as` cast is replaced with
  parse-or-`notFound()` (addresses #215 for these seams).

## 7. Rollout

Single-cutover PR: migration + all code in one deploy. Vercel runs
`migrate deploy` before the code swap, leaving a ~1-minute window where old
lambdas could write dollar floats into cents columns (Postgres would round
them into wrong-by-100× cents). Accepted at this app's traffic; deploy at a
quiet moment and spot-check any `Payment` rows written during the window.
Expand/contract staging is deliberately not used.

Operational notes:

- The shared Neon **dev** DB diverges from repo migrations (squashed `0_init`
  baseline) and DDL there is sandbox-blocked for agents — apply this migration
  via the documented `migrate diff` + `db execute` + `migrate resolve` path
  (or let CI/Vercel handle the preview/prod branches). Real-DB vitest suites
  fail locally until then; that is not a regression.
- `prisma/seed.ts` money values convert to cents (e.g. `4.85` → `485`).
- `scripts/backfillEstimateTotal.ts` converts to cents.

## 8. Testing

- Convert existing money unit tests to cents expectations:
  `__tests__/lib/estimateView/{compute,markup,snapshot}.test.ts`,
  `__tests__/lib/invoices/{compute,snapshot,createInvoiceForm,schema}.test.ts`,
  `__tests__/lib/repositories/invoiceRepo.test.ts`,
  `__tests__/api/dashboard-{revenue,kpis}.test.ts`, plus API route tests
  posting money payloads.
- New tests: `dollarsToCents`/`centsToDollars` round-trips (incl. the
  `x.995` float boundary); fold/proration exact-sum reconciliation with no
  epsilon; Zod rejection of non-integer/negative/overflow money; snapshot
  Zod accepting a legacy dollar snapshot fixture and rejecting garbage;
  `MoneyInput` parse/commit (also chips at #250).
- E2E: dollar-string assertions in `tests/e2e/public-invoice-review.spec.ts`
  should pass unchanged (display format is identical); run `--workers=1`.

## 9. Docs (same change)

- `CONTEXT.md`: *Estimate View*, *Markup*, *Invoice* sections — units are
  integer cents; `OVERBILL_EPSILON` mention replaced with the exact-compare
  rule; snapshot sections note frozen-dollars convention.
- `AGENTS.md`: `lib/money.ts` line becomes "shared cents helpers
  (`dollarsToCents`, `centsToDollars`, `residualTargetIndex`, `MAX_MONEY_CENTS`)".

## Out of scope

- Stripe PR #271 rebase (follow-up after merge).
- Overpayment guard (#256) and payment row-locking (#206) — separate issues,
  though exact integer math makes both easier afterwards.
- Migrating snapshot JSON to cents (rejected — see §6).
