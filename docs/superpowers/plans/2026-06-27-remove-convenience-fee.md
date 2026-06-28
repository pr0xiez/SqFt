# Remove the Convenience Fee — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the per-estimate convenience fee as a concept across estimate math, the edit reducer, invoice proration, API validation, UI, the Prisma schema, seed, docs, and tests — so new estimates compute `total = subtotal + markup` and nothing carries a fee.

**Architecture:** The convenience fee is `Estimate.convenienceFeeRate` (decimal), folded into `computeEstimateView` (`total = (subtotal + markup) × (1 + rate)`) and surfaced as a customer-facing row on estimates and invoices. Removing it collapses the math to `total = subtotal + markup`; the intermediate `beforeFee` field then equals `total` and is also retired (the markup fold retargets to `total`). The DB column is dropped via a new migration. Existing data is test/throwaway, so there is **no retroactive financial migration** — old invoice amounts/snapshots are left as-is.

**Tech Stack:** Next.js (vendored, see `node_modules/next/dist/docs/`), TypeScript, Prisma/Postgres, react-query, Vitest (unit/component), Biome (lint), Playwright (e2e).

## Global Constraints

- Lint must pass: `npm run lint:ci` (`biome ci .`) — required before any commit.
- Typecheck must pass: `npm run typecheck` (`tsc --noEmit`).
- Unit/component tests must pass: `npm test` (`vitest run`).
- **Never squash migrations.** Add a new migration on top; Vercel runs `prisma migrate deploy` at deploy.
- Dropping a column is safe on a populated DB; do **not** add `NOT NULL` columns.
- Applying migrations to the shared Neon dev DB is sandbox-blocked locally — the new migration applies on CI/Vercel. Local validation is `prisma generate` + `typecheck` + `npm test`.
- A fresh worktree may have incomplete `node_modules` — run `npm install` before typecheck/tests/`prisma generate` if `@prisma/client` is missing.
- Spec: `docs/superpowers/specs/2026-06-27-remove-convenience-fee-design.md`.

---

## Task 0: Preflight — ensure the worktree can build

**Files:** none (environment only)

- [ ] **Step 1: Ensure dependencies + Prisma client are present**

Run: `npm install`
Then: `npx prisma generate`
Expected: both succeed; `@prisma/client` is generated against the current schema (which still has `convenienceFeeRate`).

- [ ] **Step 2: Establish a green baseline**

Run: `npm run typecheck`
Expected: PASS (no errors) — confirms the starting point compiles before any edits.

---

## Task 1: Remove the convenience fee from all application code and tests

This is a single atomic refactor: removing the `convenienceFee`/`beforeFee` fields from the shared `EstimateView`/`EstimateInput` types breaks every consumer at once, so all source + test edits land in **one commit**. Steps are ordered leaf-consumers-first so the type fields are deleted last; verification runs only at the end.

**Files:**
- Modify: `lib/invoices/compute.ts`
- Modify: `lib/invoices/snapshot.ts`
- Modify: `lib/invoices/types.ts`
- Modify: `components/estimates/public-estimate/TotalsBlock.tsx`
- Modify: `components/estimates/PublicEstimateView.tsx`
- Modify: `app/estimate-review/[token]/page.tsx`
- Modify: `components/estimates/EstimateTotals.tsx`
- Modify: `components/estimates/LineItemSection.tsx`
- Modify: `components/estimates/EstimateBuilder.tsx`
- Modify: `lib/estimateDraft/reduce.ts`
- Modify: `lib/estimateDraft/types.ts`
- Modify: `lib/estimates/schema.ts`
- Modify: `lib/repositories/estimateRepo.ts`
- Modify: `lib/estimateView/fromPrisma.ts`
- Modify: `lib/estimateView/snapshot.ts`
- Modify: `lib/estimateView/markup.ts`
- Modify: `lib/estimateView/compute.ts`
- Modify: `lib/estimateView/types.ts`
- Modify: `lib/money.ts`
- Modify: `lib/hooks/useEstimates.ts`
- Modify: `lib/dashboard/revenue.ts`
- Modify: `lib/dashboard/kpis.ts`
- Modify: `scripts/backfillEstimateTotal.ts`
- Test: `__tests__/lib/estimateView/compute.test.ts`, `__tests__/lib/estimateView/markup.test.ts`, `__tests__/lib/estimateView/snapshot.test.ts`, `__tests__/lib/invoices/compute.test.ts`, `__tests__/lib/invoices/snapshot.test.ts`, `__tests__/lib/repositories/invoiceRepo.test.ts`, `__tests__/lib/estimateDraft/reduce.test.ts`, `__tests__/repositories/reviseEstimate.test.ts`, `__tests__/repositories/saveEstimate-locked.test.ts`, `__tests__/repositories/invoiceRepoMutations.test.ts`, `__tests__/repositories/estimateRepo.test.ts`, `__tests__/repositories/docNumberAllocation.test.ts`, `__tests__/components/estimates/EstimateBuilder.test.tsx`, `__tests__/api/estimate-review.[token].approve.test.ts`, `__tests__/api/estimates.[id].test.ts`, `__tests__/api/estimates.[id].send.test.ts`, `__tests__/api/invoices.[id].send.test.ts`, `tests/e2e/line-item-section.spec.ts`

**Interfaces:**
- Produces: `EstimateView` = `{ lines, subtotal, markup, total, deposit, hasUnresolvedLines }` (no `beforeFee`, no `convenienceFee`). `EstimateInput` = `{ lineItems, items, markupPct, depositPct }` (no `convenienceFeeRate`). `EstimateDraft` / `EstimateSavePatch` / `EstimatePatch` lose `convenienceFeeRate`. `InvoiceSnapshot.totals` = `{ subtotal, markup, balanceDue }`. `ProrationSource` loses `convenienceFeeLabel`.

### Source changes

- [ ] **Step 1: Invoice proration — drop the fee row** — `lib/invoices/compute.ts`

Delete this block (lines ~76–82):

```typescript
  if (source.view.convenienceFee > 0) {
    rows.push({
      name: source.convenienceFeeLabel ?? "Convenience fee",
      description: null,
      amount: round2(source.view.convenienceFee * ratio),
    });
  }
```

Then update the function's doc comment: remove the sentences describing the convenience-fee row (the clause "the convenience-fee row appears only when the fee is non-zero. Putting the residual on the largest row keeps the ±cent off the convenience-fee row and off any $0 (free) line." → "Putting the residual on the largest row keeps the ±cent off any $0 (free) line."). Leave the markup-fold and reconciliation logic untouched.

- [ ] **Step 2: Invoice snapshot — drop fee from frozen totals** — `lib/invoices/snapshot.ts`

In the returned `totals`, delete the line:

```typescript
      convenienceFee: source.view.convenienceFee,
```

Result:

```typescript
    totals: {
      subtotal: source.view.subtotal,
      markup: source.view.markup,
      balanceDue: meta.amount,
    },
```

- [ ] **Step 3: Invoice types — remove fee fields** — `lib/invoices/types.ts`

In `ProrationSource`, delete `convenienceFeeLabel?: string;`. In `InvoiceSnapshot.totals`, delete `convenienceFee: number;`. Result:

```typescript
  totals: {
    subtotal: number;
    markup: number;
    balanceDue: number;
  };
```

- [ ] **Step 4: Public TotalsBlock — remove the fee row + props** — `components/estimates/public-estimate/TotalsBlock.tsx`

Replace the `Props` interface and the two top rows. New `Props`:

```typescript
interface Props {
  subtotal: number;
  total: number;
  deposit: number;
  depositPct: number;
}
```

In the component body, delete the `<Row label={`Convenience fee · …`} … />` block (lines ~16–19). Since `subtotal` now equals `total`, also delete the leading `<Row label="Subtotal" … />` (line 15) so the block shows just the Total + Deposit. The component becomes:

```tsx
export function TotalsBlock(props: Props) {
  return (
    <div className="mt-6 flex flex-col items-end gap-2">
      <div className="grid grid-cols-[auto_140px] gap-8 items-baseline">
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink)] tracking-[.06em] uppercase font-[600] text-right">
          Total due
        </div>
        <div className="text-[32px] font-[700] tracking-[-0.025em] text-right text-[var(--accent)]">
          {fmtDollar(props.total)}
        </div>
      </div>
      {props.depositPct > 0 && (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-1">
          Deposit due: {fmtDollar(props.deposit)} (
          {Math.round(props.depositPct * 100)}%)
        </div>
      )}
    </div>
  );
}
```

Leave the `Row` helper in place only if still referenced; if it becomes unused after this edit, delete the `Row` function too (Biome flags unused functions).

- [ ] **Step 5: PublicEstimateView — stop reading the fee** — `components/estimates/PublicEstimateView.tsx`

In the `PublicEstimate` type, delete `convenienceFeeRate: number;` (line 21).
In the `computeEstimateView({...})` call, delete `convenienceFeeRate: estimate.convenienceFeeRate,` (line 58).
Change the destructure (line 61) from `const { convenienceFee, total, deposit } = view;` to:

```typescript
  const { total, deposit } = view;
```

Change `const markedUpSubtotal = view.beforeFee;` (line 63) to:

```typescript
  const markedUpSubtotal = view.total;
```

In the `<TotalsBlock … />` usage, delete the `convenienceFee={convenienceFee}` and `convenienceFeeRate={estimate.convenienceFeeRate}` props (lines 98–99). `subtotal={markedUpSubtotal}` may also be removed since TotalsBlock no longer takes `subtotal` — **remove the `subtotal={markedUpSubtotal}` prop and the now-unused `markedUpSubtotal` const.** Keep `total`, `deposit`, `depositPct`.

- [ ] **Step 6: Public estimate page — drop the field** — `app/estimate-review/[token]/page.tsx`

Delete `convenienceFeeRate: estimate.convenienceFeeRate,` (line 41).

- [ ] **Step 7: EstimateTotals — remove the fee row + props** — `components/estimates/EstimateTotals.tsx`

Remove `feePct`, `feeAmt`, and `onCommitFee` from `Props`, the destructure, and the rendered fee `PctRow`. New `Props`:

```typescript
interface Props {
  subtotal: number;
  markupPct: number;
  depositPct: number; // depositPctState
  markupAmt: number;
  total: number;
  deposit: number;
  readOnly: boolean;
  onCommitMarkup: (nextPct: number) => void;
  onCommitDeposit: (nextPct: number) => void;
}
```

Update the destructure to drop `feePct`, `feeAmt`, `onCommitFee`. Delete the `{/* Convenience fee */}` `<PctRow … onCommit={onCommitFee} />` block (lines ~48–55). Change the Markup row label from `"Markup (on subtotal + fee)"` to `"Markup"`.

- [ ] **Step 8: LineItemSection — drop the fee prop, draft field, dispatch** — `components/estimates/LineItemSection.tsx`

In `Props` (line 23) delete `convenienceFeeRate: number;`.
In the destructured params (line 39) delete `convenienceFeeRate: initialFee,`.
In the `useState` draft seed (lines 48–53) delete `convenienceFeeRate: initialFee,`.
In the `computeEstimateView({...})` call (lines 82–88) delete `convenienceFeeRate: draft.convenienceFeeRate,`.
In the view destructure (lines 96–102) delete `convenienceFee: feeAmt,`.
Delete the `feePct` line (105): `const feePct = Math.round(draft.convenienceFeeRate * 1000) / 10;`.
In the `<EstimateTotals … />` usage (lines 186–205) delete the `feePct={feePct}`, `feeAmt={feeAmt}`, and the entire `onCommitFee={(next) => dispatch({ type: "setConvenienceFeeRate", value: next / 100 })}` prop.

- [ ] **Step 9: EstimateBuilder — drop the fee from the view call + prop** — `components/estimates/EstimateBuilder.tsx`

In the `computeEstimateView({...})` call (lines 51–57) delete `convenienceFeeRate: estimate.convenienceFeeRate,` (line 55).
In the `<LineItemSection … />` usage (lines 144–160) delete `convenienceFeeRate={estimate.convenienceFeeRate}` (line 147).

- [ ] **Step 10: Draft reducer — remove the action case** — `lib/estimateDraft/reduce.ts`

Delete the `case "setConvenienceFeeRate":` block (lines 72–76):

```typescript
    case "setConvenienceFeeRate":
      return {
        draft: { ...draft, convenienceFeeRate: action.value },
        save: { convenienceFeeRate: action.value },
      };
```

- [ ] **Step 11: Draft types — remove field + action** — `lib/estimateDraft/types.ts`

In `EstimateDraft` delete `convenienceFeeRate: number;` (line 12). In `EstimateSavePatch` delete `convenienceFeeRate?: number;` (line 23). Delete the action variant (lines 51–52):

```typescript
  /** Set the convenience fee rate (decimal, e.g. 0.03). */
  | { type: "setConvenienceFeeRate"; value: number }
```

Update the `EstimateDraft` doc comment to drop the `convenienceFeeRate` mention (e.g. "`depositPct` is a decimal (0.5), `markupPct` is a percentage (20)").

- [ ] **Step 12: API schema — remove the validation field** — `lib/estimates/schema.ts`

In `estimateUpdateSchema` delete `convenienceFeeRate: z.number().min(0).max(1).optional(),` (line 23).

- [ ] **Step 13: Estimate repo — remove all four references** — `lib/repositories/estimateRepo.ts`

In `HydratedForTotal` (line 25) delete `convenienceFeeRate: number;`.
In `EstimatePatch` (line 160) delete `convenienceFeeRate?: number;`.
In `createEstimate` data (line 327) delete `convenienceFeeRate: 0.03,`.
In the revise/duplicate data (line 465) delete `convenienceFeeRate: original.convenienceFeeRate,`.

- [ ] **Step 14: fromPrisma adapter — remove the mapping** — `lib/estimateView/fromPrisma.ts`

In `PrismaEstimateForView` (line 32) delete `convenienceFeeRate: number;`.
In the returned object (line 49) delete `convenienceFeeRate: estimate.convenienceFeeRate,`.

- [ ] **Step 15: Estimate snapshot — remove rate + fee total** — `lib/estimateView/snapshot.ts`

In the `EstimateSnapshot` interface delete `convenienceFeeRate: number;` (line 28) and `convenienceFee: number;` from `totals` (line 38).
In the returned object delete `convenienceFeeRate: input.convenienceFeeRate,` (line 64) and `convenienceFee: view.convenienceFee,` from `totals` (line 104).

- [ ] **Step 16: Markup fold — retarget to total** — `lib/estimateView/markup.ts`

Replace `view.beforeFee` with `view.total` in both places:

```typescript
  const factor = view.subtotal === 0 ? 0 : view.total / view.subtotal;
  const amounts = view.lines.map((l) =>
    l.subtotal == null ? null : round2(l.subtotal * factor)
  );
  const target = round2(view.total);
```

Update the doc comment: change "reconciled so the resolved amounts sum exactly to `view.beforeFee` (subtotal + markup)" to "reconciled so the resolved amounts sum exactly to `view.total` (subtotal + markup)".

- [ ] **Step 17: Compute — collapse the math** — `lib/estimateView/compute.ts`

Replace lines 25–27:

```typescript
  const beforeFee = subtotal + markup;
  const convenienceFee = beforeFee * input.convenienceFeeRate;
  const total = beforeFee + convenienceFee;
```

with:

```typescript
  const total = subtotal + markup;
```

In the returned object delete the `beforeFee,` and `convenienceFee,` lines (35–36).

- [ ] **Step 18: View/input types — remove the fields** — `lib/estimateView/types.ts`

In `EstimateInput` delete the `convenienceFeeRate` field + its doc comment (lines 16–17). In `EstimateView` delete `beforeFee` (lines 38–39) and `convenienceFee` (lines 40–41) with their comments, and fix the `total` comment to `/** subtotal + markup */`.

- [ ] **Step 19: money.ts — reword the comment** — `lib/money.ts`

In the `residualTargetIndex` doc comment, the parenthetical "(a zero/negative subtotal yields a zero/negative `beforeFee`, hence zero drift)" references a removed field. Change `beforeFee` → `total`.

- [ ] **Step 19b: react-query estimate types** — `lib/hooks/useEstimates.ts`

Delete `convenienceFeeRate: number;` from `EstimateListRow` (line 31) and from `EstimateDetail` (line 56). Delete `convenienceFeeRate?: number;` from `UpdateEstimateInput` (line 88).

- [ ] **Step 19c: dashboard + backfill selects** — `lib/dashboard/revenue.ts`, `lib/dashboard/kpis.ts`, `scripts/backfillEstimateTotal.ts`

Each has a Prisma `select` (`revenueSelect` / inline) that selects the column and feeds the row to `fromPrismaEstimate(...)`. Delete the `convenienceFeeRate: true,` line from each select (`revenue.ts` line 29, `kpis.ts` line 25, `backfillEstimateTotal.ts` line 18). No other change — `fromPrismaEstimate` no longer reads the field and the column still exists at this point, so the narrower select is valid.

### Test changes

- [ ] **Step 20: `__tests__/lib/estimateView/compute.test.ts`**

Delete every `convenienceFeeRate: 0,` and `convenienceFeeRate: 0.03,` line inside the `computeEstimateView({...})` inputs (lines 31, 42, 64, 85, 97, 109, 125, 155, 168). Replace the "applies markup to subtotal, then fee to subtotal+markup" test (lines 131–145) with:

```typescript
  it("applies markup to subtotal; total is subtotal + markup", () => {
    const v = computeEstimateView({
      lineItems: [baseLi({ qty: 1000, rate: 1 })], // subtotal 1000
      items: [],
      markupPct: 20, // markup = 200
      depositPct: 0.5, // deposit = 1200 * 0.5 = 600
    });
    expect(v.subtotal).toBe(1000);
    expect(v.markup).toBe(200);
    expect(v.total).toBeCloseTo(1200);
    expect(v.deposit).toBeCloseTo(600);
  });
```

- [ ] **Step 21: `__tests__/lib/estimateView/markup.test.ts`**

In every `view({...})` fixture delete the `beforeFee: <n>,` and `convenienceFee: <n>,` lines (lines 10–11, 27, 41, 60, 74–75 region as present; every `beforeFee:`/`convenienceFee:` occurrence). The fold target is now `total`, which already equals each fixture's `beforeFee` value, so the existing `total:` values and expectations stay correct. Optionally update test titles mentioning "beforeFee" to "total" for clarity.

- [ ] **Step 22: `__tests__/lib/estimateView/snapshot.test.ts`**

In the `input` literal delete `convenienceFeeRate: 0.075,` (line 11). In the `toMatchObject` delete `convenienceFeeRate: 0.075,` (line 64). In the `totals: expect.objectContaining({...})` delete `convenienceFee: expect.any(Number),` (line 73). In any full `EstimateView` literal delete `beforeFee: 0,` and `convenienceFee: 0,` (lines 158–159).

- [ ] **Step 23: `__tests__/lib/invoices/compute.test.ts`**

Delete the two fee-specific tests entirely: "folds markup into line amounts and keeps the convenience-fee row…" (lines 68–86) and "reconciles a PARTIAL invoice with folded markup AND a convenience fee…" (lines 88–119). In every remaining `view` fixture delete the `beforeFee: <n>,` and `convenienceFee: <n>,` lines (lines 39–40, 136–137, 169–170, 201–202).

> The "reconciles rounding so line amounts sum exactly to the bill amount" test (lines 61–66) and the "$0 (free) line" test remain and still cover residual reconciliation.

- [ ] **Step 24: `__tests__/lib/invoices/snapshot.test.ts`**

In the `view` fixture delete `beforeFee: 307,` and `convenienceFee: 0,` (lines 10–11). If any assertion expects `totals.convenienceFee`, delete it.

- [ ] **Step 25: `__tests__/lib/estimateDraft/reduce.test.ts`**

In the `draft(...)` factory delete `convenienceFeeRate: 0.03,` (line 38). In any inner `computeEstimateView` input delete `convenienceFeeRate: 0,` (line 72). Delete the whole "setConvenienceFeeRate stores the decimal…" test (lines 112–120).

- [ ] **Step 26: Repository + API fixtures — delete the field**

- `__tests__/repositories/reviseEstimate.test.ts`: delete `convenienceFeeRate: 0.03,` (lines 46, 66).
- `__tests__/repositories/invoiceRepoMutations.test.ts`: delete `convenienceFeeRate: 0,` (line 79).
- `__tests__/repositories/estimateRepo.test.ts`: delete `convenienceFeeRate:` lines (282, 326, 370, 404, 435).
- `__tests__/repositories/docNumberAllocation.test.ts`: delete `convenienceFeeRate: 0.03,` (line 95).
- `__tests__/api/estimate-review.[token].approve.test.ts`: delete `convenienceFeeRate: 0.03,` (line 39).
- `__tests__/lib/repositories/invoiceRepo.test.ts`: delete `convenienceFeeRate: 0,` (line 27).
- `__tests__/components/estimates/EstimateBuilder.test.tsx`: delete `convenienceFeeRate: 0,` (line 80).
- `__tests__/api/invoices.[id].send.test.ts`: delete `convenienceFeeRate: 0,` (line 14).
- `__tests__/api/estimates.[id].send.test.ts`: delete `convenienceFeeRate: 0.03,` (lines 77, 129, 214).
- `__tests__/repositories/saveEstimate-locked.test.ts`: the two `saveEstimate(7, "org_1", { convenienceFeeRate: 0.1 })` calls (lines 35, 43) — change the patch to a still-valid field: `saveEstimate(7, "org_1", { markupPct: 5 })`.

- [ ] **Step 27: `__tests__/api/estimates.[id].test.ts` — repoint the range test**

Replace the "rejects convenienceFeeRate out of range" test (lines 86–94) with an equivalent on a field that still has a max:

```typescript
  it("rejects depositPct out of range with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/1", {
        depositPct: 2,
      }),
      params({ id: "1" })
    );
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 27b: e2e — drop the fee input from the totals flow** — `tests/e2e/line-item-section.spec.ts`

After removing the convenience-fee row, the totals `input[inputmode="decimal"]` order shifts: markup is now `nth(3)` and deposit `nth(4)` (the fee was `nth(3)`). Update the comment on line 231 to `// index 3 = markup %, 4 = deposit %.`, delete the fee interaction block (lines 242–245):

```typescript
    const fee = decimals.nth(3);
    await fee.fill("10");
    const [feePatch] = await Promise.all([waitPatch(), fee.blur()]);
    expect(feePatch.status()).toBe(200);
```

change `const markup = decimals.nth(4);` → `const markup = decimals.nth(3);` and `const deposit = decimals.nth(5);` → `const deposit = decimals.nth(4);`, and delete the assertion `expect(body.convenienceFeeRate).toBeCloseTo(0.1, 5);` (line 258). (This file is validated only by `npm run test:e2e`, not `npm test` — see final verification.)

### Verify + commit

- [ ] **Step 28: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no references to `convenienceFee`, `convenienceFeeRate`, or `beforeFee` remain in source. If errors point to a missed consumer, fix it.

- [ ] **Step 29: Run the unit/component tests**

Run: `npm test`
Expected: PASS. Pay attention to `estimateView`, `invoices`, `estimateDraft`, and repository/API suites. (Some real-DB suites are skipped/guarded locally per the environment — that is expected, not a failure introduced here.)

- [ ] **Step 30: Lint**

Run: `npm run lint:ci`
Expected: PASS. If Biome flags an unused import/variable/function left behind (e.g. `Row` in TotalsBlock, `fmtDollar`), remove it and re-run.

- [ ] **Step 31: Sanity grep**

Run: `git grep -n "convenienceFee\|beforeFee" -- lib components app scripts __tests__ tests`
Expected: no matches (only `prisma/` and `docs/` remain, handled in Tasks 2–3). Any hit is a missed spot — fix before committing.

- [ ] **Step 32: Commit**

```bash
git add lib components app scripts __tests__ tests
git commit -m "feat: remove the convenience fee from estimate/invoice code and tests"
```

---

## Task 2: Drop the `convenienceFeeRate` column (schema + migration + seed)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260627000000_drop_convenience_fee/migration.sql`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: code from Task 1 no longer reads `estimate.convenienceFeeRate`.
- Produces: the Prisma `Estimate` model and generated client no longer have `convenienceFeeRate`.

- [ ] **Step 1: Remove the column from the Prisma model** — `prisma/schema.prisma`

Delete the line (170): `convenienceFeeRate Float   @default(0.03)`.

- [ ] **Step 2: Add the migration** — create `prisma/migrations/20260627000000_drop_convenience_fee/migration.sql`

```sql
-- Drop the retired convenience fee. Existing test/throwaway estimate totals are
-- recomputed to exclude the embedded fee so they stay consistent with the new
-- math (total = subtotal + markup); no invoice amounts/snapshots are rewritten.
UPDATE "Estimate"
SET "total" = "total" / (1 + "convenienceFeeRate")
WHERE "total" IS NOT NULL AND "convenienceFeeRate" <> 0;

ALTER TABLE "Estimate" DROP COLUMN "convenienceFeeRate";
```

> The `UPDATE` must run **before** the `DROP COLUMN` (it reads the column). Do not reorder.

- [ ] **Step 3: Update the seed** — `prisma/seed.ts`

Delete `convenienceFeeRate: true,` from the `setEstimateTotal` select (line 27). Delete every `convenienceFeeRate: 0.03,` line from the estimate `create` calls (lines 497, 568, 619, 784, 813, 857, 1111, 1169, 1239, 1387). (Find them all with: `git grep -n convenienceFeeRate -- prisma/seed.ts` — there should be zero matches afterward.)

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds; the generated `Estimate` type no longer includes `convenienceFeeRate`.

- [ ] **Step 5: Typecheck (catches any lingering column read)**

Run: `npm run typecheck`
Expected: PASS. (If `prisma/seed.ts` is in the typecheck scope, a missed seed reference surfaces here.)

- [ ] **Step 6: Confirm no references remain**

Run: `git grep -n convenienceFeeRate -- prisma`
Expected: no matches.

- [ ] **Step 7: Lint + commit**

Run: `npm run lint:ci` (expect PASS), then:

```bash
git add prisma
git commit -m "feat: drop Estimate.convenienceFeeRate column + migration"
```

---

## Task 3: Sync the context docs

**Files:**
- Modify: `CONTEXT.md`
- Modify: `AGENTS.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update `CONTEXT.md`** (edit the affected sections + their file pointers; don't just append)

- **Estimate View** (~lines 76–78): remove `convenienceFee` from the totals list — `… plus totals (subtotal, markup, total, deposit) …`.
- **Estimate Draft** (~lines 102–112): remove `convenienceFeeRate` from the "three money fields" (now two: `markupPct`, `depositPct`) and drop the decimal/percent note about the fee rate.
- **Markup** (~lines 141–158): remove the sentences stating the convenience fee is steered off by `residualTargetIndex` and the "The convenience fee is not folded …" paragraph; keep the markup-fold + residual description (residual still steers off $0/unresolved lines).
- **Public estimate** bullet (~lines 150–153): change "shows Subtotal (already marked up) → Convenience fee → Total" to "shows the marked-up Total (and deposit)".
- **Invoice** (~lines 185–191): remove "only the convenience fee remains a separate row" / "so no 'Markup' row is emitted; only the convenience fee remains a separate row" — invoices now emit neither a markup nor a fee row.

- [ ] **Step 2: Update `AGENTS.md`**

Run `git grep -n -i convenience -- AGENTS.md`. If any mention remains, remove it. (If none, no edit needed.)

- [ ] **Step 3: Final repo-wide check**

Run: `git grep -n -i "convenience" -- ":!docs/superpowers/specs" ":!docs/superpowers/plans"`
Expected: no matches outside the spec/plan docs (which intentionally describe the removal).

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md AGENTS.md
git commit -m "docs: drop convenience fee from CONTEXT.md/AGENTS.md"
```

---

## Final verification (all tasks complete)

- [ ] `npm run lint:ci` — PASS
- [ ] `npm run typecheck` — PASS
- [ ] `npm test` — PASS
- [ ] `git grep -n "convenienceFee\|convenienceFeeRate\|beforeFee" -- lib components app scripts __tests__ tests prisma` — no matches
- [ ] (Optional, if UI changed materially) `npm run test:e2e -- --workers=1` for estimate/invoice review flows.

## Notes for the implementer

- The new migration **cannot be applied to the shared dev DB locally** (sandbox-blocked). That is expected; it applies on CI/Vercel via `prisma migrate deploy`. Local correctness is established by `prisma generate` + `typecheck` + `npm test`.
- Do not attempt to rewrite existing invoice amounts, payments, or frozen invoice/approval snapshots — out of scope by decision (existing data is test/throwaway).
