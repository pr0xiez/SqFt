# Per-line "Quantity unset" Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag each unresolved estimate line (no resolvable quantity) in place with an amber rail + "Quantity unset" chip, and default a new line's quantity to `0` so it never flashes that state on creation — replacing the section-level invoice warning.

**Architecture:** Pure presentational change in `LineItemRow`, driven off the `subtotal`/`effectiveQty` props it already receives (no new data plumbing). A one-line reducer default change. Deletion of the now-superseded `InvoicesSection` warning and its prop. Billing/proration logic is untouched.

**Tech Stack:** Next.js 16 (React 19) client components, Tailwind utility classes with CSS-var color tokens, Vitest 4 + @testing-library/react (jsdom), Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-06-06-line-quantity-unset-flag-design.md`

---

## Prerequisites

All work happens in the feature worktree for branch `claude/brave-sutherland-19dc4a` (PR #100):

```
D:\Code\SqFt\.claude\worktrees\brave-sutherland-19dc4a
```

Worktrees ship with **incomplete `node_modules`** (missing `@prisma/client`/`pg`, etc.). Before running the verification commands, install deps in the worktree once so `tsc` and the full Vitest suite load:

```bash
npm install        # runs postinstall → prisma generate
```

The three suites this plan touches (`LineItemRow`, `reduce`, `InvoicesSection`) are pure UI/logic and need **no** database. If `npm install` is impractical, run the targeted test files (shown per task) and rely on CI for the full suite + typecheck.

## Color tokens (already defined in `app/globals.css`)

- `--gold: #b07a1a` — the "needs attention / caution" color (already used for the waste badge). Tint: `rgba(176,122,26,0.06)` (rail bg) / `rgba(176,122,26,0.12)` (chip bg).
- `--sage: #3d6b4a` — existing left-rail for room-linked rows (kept, but suppressed when a row is also unresolved).
- `--accent: #c0341a` — brand red; **not** used here (it already means "positive subtotal").

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `lib/estimateDraft/reduce.ts` | Pure estimate-draft reducer | `addLineItem` seeds `qty: 0` (was `null`) |
| `components/estimates/LineItemRow.tsx` | Renders one line-item row | Add `unresolved` rail/tint + "Quantity unset" chip; gold-tint the linked `—` |
| `components/invoices/InvoicesSection.tsx` | Invoices block under the estimate | Remove `unresolvedLineCount` prop + warning banner |
| `components/estimates/EstimateBuilder.tsx` | Estimate detail page shell | Stop passing `unresolvedLineCount` |
| `__tests__/lib/estimateDraft/reduce.test.ts` | Reducer tests | Assert new line `qty === 0` + resolves to non-null subtotal |
| `__tests__/components/estimates/LineItemRow.test.tsx` | **New** row tests | Chip vs `$0.00` vs priced; read-only still flags |
| `__tests__/components/invoices/InvoicesSection.test.tsx` | Section tests | Remove obsolete warning test |

---

## Task 1: Default a new line's quantity to 0

**Files:**
- Modify: `lib/estimateDraft/reduce.ts:24`
- Test: `__tests__/lib/estimateDraft/reduce.test.ts`

- [ ] **Step 1: Extend the reducer tests (RED)**

In `__tests__/lib/estimateDraft/reduce.test.ts`, add this import near the top (after the existing `reduceEstimateDraft` import on line 2):

```ts
import { computeEstimateView } from "@/lib/estimateView";
```

Add `expect(added.qty).toBe(0);` to the existing `addLineItem` test, right after the `expect(added.sortOrder).toBe(1);` line:

```ts
    expect(added.sortOrder).toBe(1);
    expect(added.qty).toBe(0);
    expect(save).toEqual({ lineItems: next.lineItems });
```

Then add this new test inside the `describe("reduceEstimateDraft — addLineItem", ...)` block (after the existing `it`):

```ts
  it("seeds qty 0 so the new line resolves to a subtotal (not flagged as unset)", () => {
    const { draft: next } = reduceEstimateDraft(draft(), {
      type: "addLineItem",
      id: 7,
    });

    const view = computeEstimateView({
      lineItems: next.lineItems,
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });

    // qty 0 → effectiveQty 0 → subtotal 0 (NOT null), so the row is not flagged.
    expect(view.lines[0].subtotal).toBe(0);
    expect(view.lines[0].subtotal).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/estimateDraft/reduce.test.ts`
Expected: FAIL — `added.qty` is `null` (not `0`) and `view.lines[0].subtotal` is `null` (not `0`).

- [ ] **Step 3: Change the default**

In `lib/estimateDraft/reduce.ts`, in the `addLineItem` case, change line 24 from `qty: null,` to:

```ts
          qty: 0,
```

The full seeded object becomes:

```ts
        {
          id: action.id,
          name: "New line item",
          description: null,
          rate: 0,
          qtyMode: QtyMode.Manual,
          qty: 0,
          wastePct: 0,
          unitLabel: "sqft",
          linkedRoomIds: [],
          sortOrder: draft.lineItems.length,
        },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/estimateDraft/reduce.test.ts`
Expected: PASS (all `reduceEstimateDraft` describes green).

- [ ] **Step 5: Commit**

```bash
git add lib/estimateDraft/reduce.ts __tests__/lib/estimateDraft/reduce.test.ts
git commit -m "feat(estimates): default new line item qty to 0"
```

---

## Task 2: Flag unresolved lines in `LineItemRow`

**Files:**
- Modify: `components/estimates/LineItemRow.tsx`
- Test: `__tests__/components/estimates/LineItemRow.test.tsx` (create)

- [ ] **Step 1: Write the failing row tests (RED)**

Create `__tests__/components/estimates/LineItemRow.test.tsx`:

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineItemRow } from "@/components/estimates/LineItemRow";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { QtyMode } from "@/lib/utils";

const li = (over: Partial<LineItemCalc> = {}): LineItemCalc => ({
  id: 1,
  name: "Stair nosing",
  description: null,
  rate: 12,
  qtyMode: QtyMode.Manual,
  qty: null,
  wastePct: 0,
  unitLabel: "lf",
  linkedRoomIds: [],
  sortOrder: 0,
  ...over,
});

function renderRow(
  props: {
    li?: LineItemCalc;
    effectiveQty?: number | null;
    subtotal?: number | null;
    rooms?: RoomItem[];
    readOnly?: boolean;
  } = {}
) {
  return render(
    <LineItemRow
      li={props.li ?? li()}
      effectiveQty={props.effectiveQty ?? null}
      subtotal={props.subtotal ?? null}
      rooms={props.rooms ?? []}
      templates={[]}
      readOnly={props.readOnly ?? false}
      onUpdate={vi.fn()}
      onEditText={vi.fn()}
      onRemove={vi.fn()}
      onCommitSubtotal={vi.fn()}
      onSaveBlur={vi.fn()}
      onOpenPicker={vi.fn()}
      onApplyTemplate={vi.fn()}
    />
  );
}

describe("LineItemRow — unresolved (Quantity unset) flag", () => {
  it("flags a manual line with no quantity", () => {
    renderRow({ subtotal: null, effectiveQty: null });
    expect(screen.getByText(/Quantity unset/)).toBeDefined();
    // The misleading $0.00 must NOT appear for an unresolved line.
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("flags a room-linked line whose linked rooms were deleted", () => {
    renderRow({
      li: li({ qtyMode: QtyMode.LinkedArea, linkedRoomIds: [5] }),
      rooms: [], // room 5 no longer exists → unresolved
      subtotal: null,
      effectiveQty: null,
    });
    expect(screen.getByText(/Quantity unset/)).toBeDefined();
  });

  it("does NOT flag a deliberate $0 (free) line", () => {
    renderRow({ li: li({ qty: 0 }), effectiveQty: 0, subtotal: 0 });
    expect(screen.queryByText(/Quantity unset/)).toBeNull();
    expect(screen.getByText("$0.00")).toBeDefined();
  });

  it("does NOT flag a normally priced line", () => {
    renderRow({ li: li({ qty: 10 }), effectiveQty: 10, subtotal: 120 });
    expect(screen.queryByText(/Quantity unset/)).toBeNull();
  });

  it("still flags an unresolved line when read-only (locked estimate)", () => {
    renderRow({ subtotal: null, effectiveQty: null, readOnly: true });
    expect(screen.getByText(/Quantity unset/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/estimates/LineItemRow.test.tsx`
Expected: FAIL — "Quantity unset" is never rendered yet (the unresolved rows currently show `$0.00`).

- [ ] **Step 3: Implement the flag in `LineItemRow.tsx`**

**3a.** Add the `unresolved` derivation. In `components/estimates/LineItemRow.tsx`, the block at lines 49–54 currently ends with:

```tsx
  const canEditSubtotal =
    !readOnly && effectiveQty !== null && effectiveQty > 0;
```

Add one line directly below it:

```tsx
  const canEditSubtotal =
    !readOnly && effectiveQty !== null && effectiveQty > 0;
  // A null subtotal means the quantity can't be resolved (manual line with no
  // qty, or a room-linked line whose rooms were deleted) — it won't be billed.
  const unresolved = sub === null;
```

**3b.** Gold rail + tint, overriding the sage linked-rail. Replace the root `<div>` className block (lines 56–62):

```tsx
    <div
      className={cn(
        "border-b border-[var(--line)] last:border-b-0 transition-[background] duration-[120ms] hover:bg-[var(--surface-2)]",
        linked && "border-l-[3px] border-l-[var(--sage)]"
      )}
    >
```

with:

```tsx
    <div
      className={cn(
        "border-b border-[var(--line)] last:border-b-0 transition-[background] duration-[120ms] hover:bg-[var(--surface-2)]",
        unresolved
          ? "border-l-[3px] border-l-[var(--gold)] bg-[rgba(176,122,26,0.06)]"
          : linked && "border-l-[3px] border-l-[var(--sage)]"
      )}
    >
```

**3c.** Gold-tint the linked `—` when unresolved. Replace the linked quantity number span (lines 134–136):

```tsx
              <span className="text-[14px] font-[600] text-[var(--sage)]">
                {effectiveQty !== null ? effectiveQty.toFixed(1) : "—"}
              </span>
```

with:

```tsx
              <span
                className={cn(
                  "text-[14px] font-[600]",
                  unresolved ? "text-[var(--gold)]" : "text-[var(--sage)]"
                )}
              >
                {effectiveQty !== null ? effectiveQty.toFixed(1) : "—"}
              </span>
```

**3d.** The "Quantity unset" chip in the subtotal cell. Replace the subtotal-cell body (lines 181–206) — i.e. the `{canEditSubtotal ? (...) : (...)}` expression:

```tsx
          {canEditSubtotal ? (
            <>
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] pointer-events-none">
                $
              </span>
              <DecimalInput
                value={sub ?? 0}
                onCommit={(next) => onCommitSubtotal(next)}
                formatOnBlur
                title="Edit subtotal — rate will be recalculated from quantity"
                className={cn(
                  "w-full text-[14px] font-[600] tracking-[-0.01em] pl-3 border-none bg-transparent p-0 focus:outline-none",
                  sub && sub > 0 ? "text-[var(--accent)]" : ""
                )}
              />
            </>
          ) : (
            <span
              className={cn(
                "text-[14px] font-[600] tracking-[-0.01em]",
                sub && sub > 0 ? "text-[var(--accent)]" : ""
              )}
            >
              ${(sub ?? 0).toFixed(2)}
            </span>
          )}
```

with (adds the `unresolved` branch between the two existing ones):

```tsx
          {canEditSubtotal ? (
            <>
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] pointer-events-none">
                $
              </span>
              <DecimalInput
                value={sub ?? 0}
                onCommit={(next) => onCommitSubtotal(next)}
                formatOnBlur
                title="Edit subtotal — rate will be recalculated from quantity"
                className={cn(
                  "w-full text-[14px] font-[600] tracking-[-0.01em] pl-3 border-none bg-transparent p-0 focus:outline-none",
                  sub && sub > 0 ? "text-[var(--accent)]" : ""
                )}
              />
            </>
          ) : unresolved ? (
            <span
              title="This line has no quantity, so it won't be billed"
              className="inline-block font-[var(--font-mono)] text-[10px] font-[600] text-[var(--gold)] bg-[rgba(176,122,26,0.12)] border border-[var(--gold)] rounded-[4px] px-2 py-0.5 whitespace-nowrap"
            >
              ⚠ Quantity unset
            </span>
          ) : (
            <span
              className={cn(
                "text-[14px] font-[600] tracking-[-0.01em]",
                sub && sub > 0 ? "text-[var(--accent)]" : ""
              )}
            >
              ${(sub ?? 0).toFixed(2)}
            </span>
          )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/estimates/LineItemRow.test.tsx`
Expected: PASS (all 5 cases green).

- [ ] **Step 5: Commit**

```bash
git add components/estimates/LineItemRow.tsx __tests__/components/estimates/LineItemRow.test.tsx
git commit -m "feat(estimates): flag unresolved line items with a Quantity unset chip"
```

---

## Task 3: Remove the superseded section-level warning

**Files:**
- Modify: `components/invoices/InvoicesSection.tsx`
- Modify: `components/estimates/EstimateBuilder.tsx:162-169`
- Modify: `__tests__/components/invoices/InvoicesSection.test.tsx`

- [ ] **Step 1: Remove the obsolete warning test**

In `__tests__/components/invoices/InvoicesSection.test.tsx`, delete the entire test starting at line 87 (`it("warns (without blocking) when the estimate has unresolved line items", ...)`) through its closing `});` on line 103. The file's `describe` block then contains only the two remaining tests.

- [ ] **Step 2: Remove the prop + banner from `InvoicesSection.tsx`**

Replace the component signature (lines 26–38):

```tsx
export function InvoicesSection({
  estimateId,
  estimateTotal,
  unresolvedLineCount = 0,
  defaultDepositPct,
}: {
  estimateId: number;
  estimateTotal: number;
  /** Line items with no resolvable price; they are excluded from the total and
   *  won't be billed, so we warn (but never block) the builder. */
  unresolvedLineCount?: number;
  defaultDepositPct: number;
}) {
```

with:

```tsx
export function InvoicesSection({
  estimateId,
  estimateTotal,
  defaultDepositPct,
}: {
  estimateId: number;
  estimateTotal: number;
  defaultDepositPct: number;
}) {
```

Then delete the banner block (lines 76–86):

```tsx
      {unresolvedLineCount > 0 ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-[var(--accent)] px-4 py-2.5 text-[12px] text-[var(--accent)]"
        >
          {unresolvedLineCount === 1
            ? "1 line item has no price yet"
            : `${unresolvedLineCount} line items have no price yet`}{" "}
          and won't be billed — resolve them to include their value.
        </p>
      ) : null}
```

(Delete it entirely — the `<div>…SummaryCell…</div>` block above and the `{isLoading ? …}` block below sit directly adjacent.)

- [ ] **Step 3: Stop passing the prop from `EstimateBuilder.tsx`**

Replace the `<InvoicesSection>` usage (lines 162–169):

```tsx
      <InvoicesSection
        estimateId={estimateId}
        estimateTotal={estimateView.total}
        unresolvedLineCount={
          estimateView.lines.filter((l) => l.subtotal === null).length
        }
        defaultDepositPct={estimate.org?.defaultDepositPct ?? 0.3}
      />
```

with:

```tsx
      <InvoicesSection
        estimateId={estimateId}
        estimateTotal={estimateView.total}
        defaultDepositPct={estimate.org?.defaultDepositPct ?? 0.3}
      />
```

Leave the `estimateView` computation above it intact — `estimateView.total` is still used.

- [ ] **Step 4: Verify (typecheck + tests)**

Run: `npx vitest run __tests__/components/invoices/InvoicesSection.test.tsx`
Expected: PASS (two tests; the warning test is gone).

Run: `npm run typecheck`
Expected: PASS — no references to `unresolvedLineCount` remain (the removed prop would otherwise surface here).

- [ ] **Step 5: Commit**

```bash
git add components/invoices/InvoicesSection.tsx components/estimates/EstimateBuilder.tsx __tests__/components/invoices/InvoicesSection.test.tsx
git commit -m "refactor(invoicing): drop section-level unresolved-line warning (replaced by per-line flag)"
```

---

## Task 4: Full verification

**Files:** none (gate only).

- [ ] **Step 1: Lint**

Run: `npm run lint:ci`
Expected: PASS, no errors. If Biome reports formatting diffs, run `npm run lint:fix`, re-run `npm run lint:ci`, and `git add -A && git commit -m "style: biome format"`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (requires `npm install` in the worktree per Prerequisites).

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: PASS. (Per the worktree caveat, DB/email suites only load after `npm install`. If you couldn't install, confirm the three touched suites pass and let CI run the rest.)

- [ ] **Step 4: Push**

```bash
git push
```

The change rides on PR #100 (`claude/brave-sutherland-19dc4a`). No schema change → no seed-script update (AGENTS.md checklist satisfied).

---

## Notes / accepted limitations

- **Locked estimates show the flag too** (per decision). The builder recomputes live, so an approved estimate where a room was deleted *after* approval will now show "Quantity unset" on a line that the frozen approval snapshot still has priced. Display-only; the snapshot and any issued invoices are unaffected. Documented in the spec.
- **No changes** to `lib/invoices/compute.ts` (prorate omitting null lines) or `lib/estimateView/*` math — billing correctness is out of scope.
- **Public estimate view** (snapshot-backed, customer-facing) is intentionally not flagged.
