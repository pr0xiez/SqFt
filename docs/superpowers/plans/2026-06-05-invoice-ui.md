# Invoice UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the builder-facing UI to create, send, and record payment on invoices against an estimate, and fold markup into customer-facing line-item prices on both the invoice and the estimate so customers never see a "markup" line.

**Architecture:** React Query hooks wrap the existing invoice API routes (no backend changes except one additive field + the markup-presentation change). The estimate detail page gains a billing summary + invoice list + "Create invoice" modal; each invoice opens a dedicated `/invoices/[id]` page with status-driven actions (Send / Record payment / Void) implemented as modal dialogs following the existing `SendEstimateDialog` idiom. Markup folding is a shared pure helper consumed by invoice proration and the public estimate view.

**Tech Stack:** Next.js 16 (App Router), React 19, TanStack React Query v5, Zod v4, Prisma 7, Vitest 4 (+ jsdom, Testing Library), Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-06-05-invoice-ui-design.md`

**Conventions:**
- Unit/component tests: `npx vitest run <path>`
- E2E: `npx playwright test <path> --workers=1` (single worker matches CI and avoids known parallel-contention flakiness)
- Lint: `npx biome ci .` (must pass clean before any commit per AGENTS.md)
- Typecheck: `npm run typecheck`
- Commit after every green task.

---

## File Structure

**Phase A — Markup folding (shared, do first; the invoice customer view depends on it)**
- Create: `lib/estimateView/markup.ts` — `foldMarkupIntoLines(view)` pure helper
- Modify: `lib/estimateView/index.ts` — export the helper
- Modify: `lib/invoices/compute.ts` — `prorateInvoice` folds markup, drops the markup row
- Modify: `lib/invoices/types.ts` — drop the now-unused `markupLabel` field
- Modify: `components/estimates/public-estimate/TotalsBlock.tsx` — drop the "Labor & margin" row
- Modify: `components/estimates/PublicEstimateView.tsx` — feed marked-up line subtotals + marked-up subtotal
- Modify: `__tests__/lib/invoices/compute.test.ts` — markup-folding assertions
- Modify: `tests/e2e/public-estimate-review.spec.ts` — assert no markup line visible

**Phase B — Invoice data layer**
- Create: `lib/hooks/useInvoices.ts` — types + query/mutation hooks
- Modify: `lib/repositories/estimateRepo.ts` — add `org.defaultDepositPct` to `getEstimate`
- Modify: `lib/hooks/useEstimates.ts` — add `org.defaultDepositPct` to `EstimateDetail`

**Phase C — Estimate-page invoices section**
- Modify: `components/invoices/InvoicesSection.tsx` — billing summary + list + Create button
- Modify: `components/estimates/EstimateBuilder.tsx` — pass `estimateTotal` + `defaultDepositPct`
- Modify: `__tests__/components/invoices/InvoicesSection.test.tsx`

**Phase D — Create dialog**
- Create: `components/invoices/CreateInvoiceDialog.tsx`
- Create: `__tests__/components/invoices/CreateInvoiceDialog.test.tsx`

**Phase E — Invoice detail page + action dialogs**
- Create: `app/(app)/invoices/[id]/page.tsx` (under the `(app)` route group → URL `/invoices/[id]`)
- Create: `components/invoices/InvoiceDetail.tsx`
- Create: `components/invoices/SendInvoiceDialog.tsx`
- Create: `components/invoices/RecordPaymentDialog.tsx`
- Create: `components/invoices/VoidInvoiceDialog.tsx`

**Phase F — E2E**
- Modify: `tests/e2e/fixtures/seed.ts` — invoice seed helpers
- Create: `tests/e2e/invoice-create.spec.ts`, `invoice-send.spec.ts`, `invoice-payment.spec.ts`, `public-invoice-review.spec.ts`

---

## Phase A — Markup folding

### Task 1: `foldMarkupIntoLines` helper

**Files:**
- Create: `lib/estimateView/markup.ts`
- Modify: `lib/estimateView/index.ts`
- Test: `__tests__/lib/estimateView/markup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/estimateView/markup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { foldMarkupIntoLines } from "@/lib/estimateView/markup";
import type { EstimateView } from "@/lib/estimateView/types";

function view(partial: Partial<EstimateView>): EstimateView {
  return {
    lines: [],
    subtotal: 0,
    markup: 0,
    beforeFee: 0,
    convenienceFee: 0,
    total: 0,
    deposit: 0,
    hasUnresolvedLines: false,
    ...partial,
  };
}

describe("foldMarkupIntoLines", () => {
  it("returns line subtotals unchanged when markup is zero", () => {
    const v = view({
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 307 },
        { id: 2, effectiveQty: 1, subtotal: 3380 },
      ],
      subtotal: 3687,
      beforeFee: 3687,
      total: 3687,
    });
    expect(foldMarkupIntoLines(v)).toEqual([307, 3380]);
  });

  it("distributes markup proportionally and sums exactly to beforeFee", () => {
    const v = view({
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 307 },
        { id: 2, effectiveQty: 1, subtotal: 3380 },
      ],
      subtotal: 3687,
      markup: 368.7,
      beforeFee: 4055.7,
      total: 4055.7,
    });
    const out = foldMarkupIntoLines(v);
    expect(out).toEqual([337.7, 3718]);
    expect(out.reduce((s, a) => s + (a ?? 0), 0)).toBeCloseTo(4055.7, 6);
  });

  it("leaves unresolved lines null and reconciles drift onto the last resolved line", () => {
    const v = view({
      lines: [
        { id: 1, effectiveQty: null, subtotal: null },
        { id: 2, effectiveQty: 1, subtotal: 100 },
      ],
      subtotal: 100,
      markup: 33.34,
      beforeFee: 133.34,
      total: 133.34,
    });
    const out = foldMarkupIntoLines(v);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(133.34);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/estimateView/markup.test.ts`
Expected: FAIL — cannot find module `@/lib/estimateView/markup`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/estimateView/markup.ts`:

```ts
import type { EstimateView } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Fold markup into each line's displayed price. Returns per-line amounts with
 * markup distributed proportionally, reconciled so the resolved amounts sum
 * exactly to `view.beforeFee` (subtotal + markup). Unresolved lines (null
 * subtotal) stay null and receive no markup. Markup is never surfaced to
 * customers as its own line — it is an internal pricing setting.
 */
export function foldMarkupIntoLines(view: EstimateView): Array<number | null> {
  const factor = view.subtotal === 0 ? 0 : view.beforeFee / view.subtotal;
  const amounts = view.lines.map((l) =>
    l.subtotal == null ? null : round2(l.subtotal * factor)
  );
  const target = round2(view.beforeFee);
  const sum = round2(amounts.reduce((s, a) => s + (a ?? 0), 0));
  const drift = round2(target - sum);
  if (drift !== 0) {
    for (let i = amounts.length - 1; i >= 0; i--) {
      if (amounts[i] != null) {
        amounts[i] = round2((amounts[i] as number) + drift);
        break;
      }
    }
  }
  return amounts;
}
```

- [ ] **Step 4: Export from the barrel**

In `lib/estimateView/index.ts`, add after the `computeEstimateView` export:

```ts
export { foldMarkupIntoLines } from "./markup";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/estimateView/markup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/estimateView/markup.ts lib/estimateView/index.ts __tests__/lib/estimateView/markup.test.ts
git commit -m "feat(invoicing): foldMarkupIntoLines helper — distribute markup into line prices"
```

---

### Task 2: Fold markup in invoice proration

**Files:**
- Modify: `lib/invoices/compute.ts:44-85` (`prorateInvoice`)
- Modify: `lib/invoices/types.ts` (drop `markupLabel`)
- Test: `__tests__/lib/invoices/compute.test.ts:68-77`

- [ ] **Step 1: Rewrite the failing test**

In `__tests__/lib/invoices/compute.test.ts`, replace the third `it(...)` block (lines 68-77, "emits markup and convenience-fee rows only when non-zero") with:

```ts
  it("folds markup into line amounts and keeps the convenience-fee row (never a Markup row)", () => {
    const withFees: ProrationSource = {
      ...source,
      view: {
        ...source.view,
        markup: 368.7,
        beforeFee: 4055.7,
        convenienceFee: 50,
        total: 4105.7,
      },
    };
    const out = prorateInvoice(withFees, 4105.7); // ratio 1
    const names = out.lines.map((l) => l.name);
    expect(names).not.toContain("Markup");
    expect(names).toContain("Convenience fee");
    expect(out.lines.find((l) => l.name === "RED OAK")?.amount).toBe(3718);
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(4105.7);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/invoices/compute.test.ts`
Expected: FAIL — current code still emits a "Markup" row, so `names` contains "Markup".

- [ ] **Step 3: Rewrite `prorateInvoice`**

Replace the body of `prorateInvoice` in `lib/invoices/compute.ts` (lines 44-85) with:

```ts
export function prorateInvoice(
  source: ProrationSource,
  amount: number
): ProratedBreakdown {
  const estimateTotal = source.view.total;
  const ratio = estimateTotal === 0 ? 0 : amount / estimateTotal;
  const folded = foldMarkupIntoLines(source.view);

  const rows: ProratedLine[] = [];
  source.view.lines.forEach((_line, idx) => {
    const meta = source.lineMeta[idx];
    rows.push({
      name: meta?.name ?? `Item ${idx + 1}`,
      description: meta?.description ?? null,
      amount: round2((folded[idx] ?? 0) * ratio),
    });
  });
  if (source.view.convenienceFee > 0) {
    rows.push({
      name: source.convenienceFeeLabel ?? "Convenience fee",
      description: null,
      amount: round2(source.view.convenienceFee * ratio),
    });
  }

  // Reconcile: force the sum to equal `amount` by adjusting the last row.
  const target = round2(amount);
  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const drift = round2(target - sum);
  if (drift !== 0 && rows.length > 0) {
    const last = rows[rows.length - 1];
    last.amount = round2(last.amount + drift);
  }

  return { ratio, lines: rows, total: target };
}
```

Add the import at the top of `lib/invoices/compute.ts` (below the existing `./types` import):

```ts
import { foldMarkupIntoLines } from "@/lib/estimateView/markup";
```

- [ ] **Step 4: Drop the unused `markupLabel` field**

In `lib/invoices/types.ts`, remove the `markupLabel?` line from the `ProrationSource` interface (keep `convenienceFeeLabel?`):

```ts
export interface ProrationSource {
  view: EstimateView;
  lineMeta: Array<{ name: string; description: string | null }>;
  convenienceFeeLabel?: string;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/invoices/compute.test.ts __tests__/lib/invoices/snapshot.test.ts`
Expected: PASS. (The snapshot test uses `markup: 0`, so its line amount is unchanged.)

- [ ] **Step 6: Lint + commit**

```bash
npx biome ci .
git add lib/invoices/compute.ts lib/invoices/types.ts __tests__/lib/invoices/compute.test.ts
git commit -m "feat(invoicing): fold markup into invoice proration; drop the Markup row"
```

---

### Task 3: Fold markup in the public estimate view

**Files:**
- Modify: `components/estimates/public-estimate/TotalsBlock.tsx`
- Modify: `components/estimates/PublicEstimateView.tsx:52-102`

- [ ] **Step 1: Drop the markup row from `TotalsBlock`**

Replace `components/estimates/public-estimate/TotalsBlock.tsx` entirely with (props `markup` and `markupPct` removed; "Subtotal" now shows the marked-up subtotal passed by the caller):

```tsx
import { fmtDollar } from "@/lib/utils";

interface Props {
  subtotal: number;
  convenienceFee: number;
  convenienceFeeRate: number;
  total: number;
  deposit: number;
  depositPct: number;
}

export function TotalsBlock(props: Props) {
  return (
    <div className="mt-6 flex flex-col items-end gap-2">
      <Row label="Subtotal" value={fmtDollar(props.subtotal)} />
      <Row
        label={`Convenience fee · ${(props.convenienceFeeRate * 100).toFixed(1)}%`}
        value={fmtDollar(props.convenienceFee)}
      />
      <div className="h-[1.5px] bg-[var(--ink)] w-[280px] my-1.5" />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_140px] gap-8 items-baseline">
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] text-right">
        {label}
      </div>
      <div className="font-[var(--font-mono)] text-[13px] font-[600] text-right text-[var(--ink-2)]">
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Feed marked-up amounts from `PublicEstimateView`**

In `components/estimates/PublicEstimateView.tsx`:

Add to the imports from `@/lib/estimateView` (line 1):

```tsx
import { computeEstimateView, foldMarkupIntoLines } from "@/lib/estimateView";
```

Replace the destructure (line 61) and the `LineItemsTable` + `TotalsBlock` usages (lines 89-102) with:

```tsx
  const { convenienceFee, total, deposit } = view;
  const foldedLineAmounts = foldMarkupIntoLines(view);
  const markedUpSubtotal = view.beforeFee;
```

```tsx
            <LineItemsTable
              lineItems={estimate.lineItems}
              subtotals={
                new Map(view.lines.map((l, idx) => [l.id, foldedLineAmounts[idx]]))
              }
            />
            <TotalsBlock
              subtotal={markedUpSubtotal}
              convenienceFee={convenienceFee}
              convenienceFeeRate={estimate.convenienceFeeRate}
              total={total}
              deposit={deposit}
              depositPct={estimate.depositPct}
            />
```

(`subtotal` and `markup` are no longer destructured/used; remove them from the destructure as shown.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npx biome ci .`
Expected: no errors. (If `markup`/`subtotal` are flagged unused anywhere, ensure they were removed from the destructure.)

- [ ] **Step 4: Commit**

```bash
git add components/estimates/public-estimate/TotalsBlock.tsx components/estimates/PublicEstimateView.tsx
git commit -m "feat(estimates): fold markup into public estimate line prices; drop Labor & margin row"
```

---

### Task 4: E2E — markup never visible on the public estimate

**Files:**
- Modify: `tests/e2e/public-estimate-review.spec.ts`

- [ ] **Step 1: Add the failing assertion test**

Append this `test.describe` block to `tests/e2e/public-estimate-review.spec.ts` (it uses the same fixtures the file already imports; if `loginAsWorkerOrg`, `createCustomerAndEstimate`, `seedEstimateWithLineItem`, `getApprovalToken` are not yet imported there, add them to the existing import from `./fixtures/org` and `./fixtures/seed`):

```ts
test.describe("public estimate hides markup", () => {
  test("renders no Markup / Labor & margin line even with markup set", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { markupPct: 25 },
    });
    const token = await getApprovalToken(ctx.request, estimateId);

    const page = await ctx.newPage();
    await page.goto(`/estimate-review/${token}`);
    await expect(page.getByText("Line items")).toBeVisible();
    await expect(page.getByText("Markup", { exact: false })).toHaveCount(0);
    await expect(
      page.getByText("Labor & margin", { exact: false })
    ).toHaveCount(0);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/public-estimate-review.spec.ts --workers=1`
Expected: PASS (markup folded into line prices, no markup label rendered).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/public-estimate-review.spec.ts
git commit -m "test(e2e): assert markup is never shown on the public estimate"
```

---

## Phase B — Invoice data layer

### Task 5: Invoice hooks

**Files:**
- Create: `lib/hooks/useInvoices.ts`

- [ ] **Step 1: Write the hooks module**

Create `lib/hooks/useInvoices.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";

export interface InvoicePayment {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  recordedByName: string | null;
}

export interface InvoiceEvent {
  id: number;
  type: string;
  source: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface InvoiceLine {
  name: string;
  description: string | null;
  amount: number;
}

export interface InvoiceListItem {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  memo: string | null;
  dueDate: string | null;
  payments: Array<{ amount: number }>;
}

export interface InvoiceDetail {
  id: number;
  estimateId: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  pct: number | null;
  memo: string | null;
  terms: string;
  coverNote: string;
  paymentInstructions: string;
  date: string;
  dueDate: string | null;
  publicToken: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  snapshot: { lines?: InvoiceLine[] } | null;
  payments: InvoicePayment[];
  invoiceEvents: InvoiceEvent[];
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const { message } = await readApiError(res, fallback);
    throw new Error(message);
  }
  return res.json();
}

export function useInvoices(estimateId: number) {
  return useQuery({
    queryKey: ["invoices", "estimate", estimateId],
    queryFn: async () =>
      jsonOrThrow<InvoiceListItem[]>(
        await fetch(`/api/estimates/${estimateId}/invoices`),
        "Failed to load invoices"
      ),
    enabled: !!estimateId,
  });
}

export function useInvoice(id: number) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: async () =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/invoices/${id}`),
        "Failed to load invoice"
      ),
    enabled: !!id,
  });
}

export interface CreateInvoiceVariables {
  amount: number;
  memo?: string;
  dueDate?: string;
  coverNote?: string;
  terms?: string;
}

export function useCreateInvoice(estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateInvoiceVariables): Promise<InvoiceDetail> =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/estimates/${estimateId}/invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
        "Failed to create invoice"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates", estimateId] });
    },
  });
}

export interface SendInvoiceVariables {
  to: string;
  subject: string;
}

export function useSendInvoice(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SendInvoiceVariables): Promise<{ ok: true }> =>
      jsonOrThrow<{ ok: true }>(
        await fetch(`/api/invoices/${id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
        "Send failed"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
    },
  });
}

export interface RecordPaymentVariables {
  amount: number;
  method: string;
  paidAt?: string;
  reference?: string;
  note?: string;
}

export function useRecordPayment(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: RecordPaymentVariables): Promise<InvoiceDetail> =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/invoices/${id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
        "Failed to record payment"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
    },
  });
}

export function useVoidInvoice(id: number, estimateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<InvoiceDetail> =>
      jsonOrThrow<InvoiceDetail>(
        await fetch(`/api/invoices/${id}/void`, { method: "POST" }),
        "Failed to void invoice"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices", "estimate", estimateId] });
    },
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npx biome ci .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useInvoices.ts
git commit -m "feat(invoicing): react-query hooks for invoices (list/detail/create/send/pay/void)"
```

---

### Task 6: Expose `org.defaultDepositPct` on the estimate detail

**Files:**
- Modify: `lib/repositories/estimateRepo.ts:283` (the `getEstimate` org select)
- Modify: `lib/repositories/estimateRepo.ts` (the matching payload type around line 98, if a `satisfies`/type literal mirrors the select)
- Modify: `lib/hooks/useEstimates.ts:80` (`EstimateDetail.org`)

- [ ] **Step 1: Widen the Prisma select**

In `lib/repositories/estimateRepo.ts`, in the `getEstimate` function, change the org select (the occurrence at ~line 283 inside `getEstimate`'s `include`):

```ts
      org: { select: { name: true, defaultDepositPct: true } },
```

If the file declares a payload type literal that mirrors this include (search for `org: { select: { name: true } }` as a TS type near line 98 — note the `;` separators indicate the type literal vs the `,` runtime object), update that type literal the same way:

```ts
    org: { select: { name: true; defaultDepositPct: true } };
```

- [ ] **Step 2: Extend the client type**

In `lib/hooks/useEstimates.ts`, change the `org` field on `EstimateDetail` (line ~80):

```ts
  org?: { name: string; defaultDepositPct: number } | null;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/repositories/estimateRepo.ts lib/hooks/useEstimates.ts
git commit -m "feat(estimates): expose org.defaultDepositPct on estimate detail for invoice default"
```

---

## Phase C — Estimate-page invoices section

### Task 7: Billing summary + invoice list + Create button

**Files:**
- Modify: `components/invoices/InvoicesSection.tsx` (full rewrite)
- Modify: `components/estimates/EstimateBuilder.tsx:224` (pass props)
- Test: `__tests__/components/invoices/InvoicesSection.test.tsx`

- [ ] **Step 1: Update the component test**

Replace `__tests__/components/invoices/InvoicesSection.test.tsx` with:

```tsx
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 1,
              invoiceNumber: 7465,
              status: "sent",
              amount: 4000,
              memo: "Deposit",
              dueDate: null,
              payments: [{ amount: 1000 }],
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    )
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvoicesSection", () => {
  it("renders the billing summary and invoice rows", async () => {
    render(
      wrap(
        <InvoicesSection
          estimateId={3}
          estimateTotal={10000}
          defaultDepositPct={0.3}
        />
      )
    );
    await waitFor(() => expect(screen.getByText("7465")).toBeDefined());
    // Invoiced 4000, unbilled 6000 from estimateTotal 10000
    expect(screen.getByText(/\$6,000/)).toBeDefined();
    expect(screen.getByText("Deposit")).toBeDefined();
  });

  it("shows an empty state with no invoices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
    );
    render(
      wrap(
        <InvoicesSection
          estimateId={3}
          estimateTotal={10000}
          defaultDepositPct={0.3}
        />
      )
    );
    await waitFor(() =>
      expect(screen.getByText("No invoices yet.")).toBeDefined()
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/invoices/InvoicesSection.test.tsx`
Expected: FAIL — `InvoicesSection` does not yet accept `estimateTotal`/`defaultDepositPct` and renders no billing summary.

- [ ] **Step 3: Rewrite `InvoicesSection`**

Replace `components/invoices/InvoicesSection.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { Button } from "@/components/ui/Button";
import { computeEstimateBilling } from "@/lib/invoices";
import { type InvoiceListItem, useInvoices } from "@/lib/hooks/useInvoices";
import { fmtDollar } from "@/lib/utils";

function paidTotal(row: InvoiceListItem): number {
  return row.payments.reduce((s, p) => s + p.amount, 0);
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)]">
        {label}
      </div>
      <div className="text-[16px] font-[700]">{value}</div>
    </div>
  );
}

export function InvoicesSection({
  estimateId,
  estimateTotal,
  defaultDepositPct,
}: {
  estimateId: number;
  estimateTotal: number;
  defaultDepositPct: number;
}) {
  const { data, isLoading, error } = useInvoices(estimateId);
  const [createOpen, setCreateOpen] = useState(false);

  const invoices = data ?? [];
  const billing = computeEstimateBilling(
    estimateTotal,
    invoices.map((i) => ({
      amount: i.amount,
      status: i.status,
      paidAmount: paidTotal(i),
    }))
  );

  return (
    <section className="mt-8 border-t border-[var(--line)] pt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-[700]">Invoices</h2>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={billing.unbilled <= 0}
        >
          + Create invoice
        </Button>
      </div>

      <div className="flex gap-6 mb-4 rounded-md bg-[var(--surface-2)] px-4 py-3">
        <SummaryCell label="Invoiced" value={fmtDollar(billing.invoiced)} />
        <SummaryCell label="Unbilled" value={fmtDollar(billing.unbilled)} />
        <SummaryCell
          label="Outstanding"
          value={fmtDollar(billing.outstanding)}
        />
      </div>

      {isLoading ? (
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-[var(--accent)]">
          {(error as Error).message}
        </p>
      ) : null}
      {!isLoading && invoices.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)]">No invoices yet.</p>
      ) : null}

      {invoices.length > 0 ? (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--muted)] text-[11px] uppercase">
              <th className="py-1">#</th>
              <th className="py-1">Memo</th>
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Amount</th>
              <th className="py-1 text-right">Paid</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-2">{row.invoiceNumber}</td>
                <td className="py-2">{row.memo ?? "—"}</td>
                <td className="py-2">{row.status}</td>
                <td className="py-2 text-right">{fmtDollar(row.amount)}</td>
                <td className="py-2 text-right">{fmtDollar(paidTotal(row))}</td>
                <td className="py-2 text-right">
                  <Link
                    href={`/invoices/${row.id}`}
                    className="text-[var(--accent)] underline"
                  >
                    open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <CreateInvoiceDialog
        estimateId={estimateId}
        unbilled={billing.unbilled}
        defaultDepositPct={defaultDepositPct}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </section>
  );
}
```

> The `CreateInvoiceDialog` import resolves in Task 8. To keep this task independently green, complete Task 8 in the same working session before running the full suite; the unit test in Step 1 stubs fetch and renders the dialog closed (`open={false}` by default → returns null), so it passes once `CreateInvoiceDialog` exists.

- [ ] **Step 4: Pass props from `EstimateBuilder`**

In `components/estimates/EstimateBuilder.tsx`, the file already computes the estimate (with `lineItems`, `rooms`, `markupPct`, `convenienceFeeRate`, `depositPct`). Near the top of the component body, compute the total once (reuse any existing `computeEstimateView` call if present; otherwise add):

```tsx
import { computeEstimateView } from "@/lib/estimateView";
```

```tsx
  const estimateView = computeEstimateView({
    lineItems: estimate.lineItems ?? [],
    items: estimate.siteMeasure.items,
    markupPct: estimate.markupPct,
    convenienceFeeRate: estimate.convenienceFeeRate,
    depositPct: estimate.depositPct,
  });
```

Then replace the existing `<InvoicesSection estimateId={estimateId} />` (line 224) with:

```tsx
      <InvoicesSection
        estimateId={estimateId}
        estimateTotal={estimateView.total}
        defaultDepositPct={estimate.org?.defaultDepositPct ?? 0.3}
      />
```

> If `EstimateBuilder` already computes an estimate view under another variable name, reuse it instead of adding a second `computeEstimateView` call (DRY).

- [ ] **Step 5: Run the test**

Run: `npx vitest run __tests__/components/invoices/InvoicesSection.test.tsx`
Expected: PASS (after Task 8 creates `CreateInvoiceDialog`).

- [ ] **Step 6: Commit**

```bash
git add components/invoices/InvoicesSection.tsx components/estimates/EstimateBuilder.tsx __tests__/components/invoices/InvoicesSection.test.tsx
git commit -m "feat(invoicing): billing summary + invoice list + create entrypoint on estimate page"
```

---

## Phase D — Create dialog

### Task 8: `CreateInvoiceDialog`

**Files:**
- Create: `components/invoices/CreateInvoiceDialog.tsx`
- Test: `__tests__/components/invoices/CreateInvoiceDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/invoices/CreateInvoiceDialog.test.tsx`:

```tsx
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("CreateInvoiceDialog", () => {
  it("defaults to Remaining balance and previews the full unbilled amount", () => {
    render(
      wrap(
        <CreateInvoiceDialog
          estimateId={1}
          unbilled={4000}
          defaultDepositPct={0.3}
          open
          onClose={() => {}}
        />
      )
    );
    expect(screen.getByText(/\$4,000\.00/)).toBeDefined();
    expect(screen.getByText(/Leaves \$0/)).toBeDefined();
  });

  it("switches to % of balance and previews the org default deposit", () => {
    render(
      wrap(
        <CreateInvoiceDialog
          estimateId={1}
          unbilled={4000}
          defaultDepositPct={0.3}
          open
          onClose={() => {}}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "% of balance" }));
    // 30% of 4000 = 1200
    expect(screen.getByText(/\$1,200\.00/)).toBeDefined();
  });

  it("warns when a flat amount exceeds the unbilled balance", () => {
    render(
      wrap(
        <CreateInvoiceDialog
          estimateId={1}
          unbilled={4000}
          defaultDepositPct={0.3}
          open
          onClose={() => {}}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Flat amount" }));
    const input = screen.getByLabelText("Amount");
    fireEvent.change(input, { target: { value: "9999" } });
    expect(screen.getByText(/exceeds/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/invoices/CreateInvoiceDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

Create `components/invoices/CreateInvoiceDialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCreateInvoice } from "@/lib/hooks/useInvoices";
import { fmtDollar } from "@/lib/utils";

type Mode = "remaining" | "pct" | "flat";

interface Props {
  estimateId: number;
  unbilled: number;
  defaultDepositPct: number; // decimal, e.g. 0.3
  open: boolean;
  onClose: () => void;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const labelCls =
  "block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1";
const inputCls =
  "w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]";

export function CreateInvoiceDialog({
  estimateId,
  unbilled,
  defaultDepositPct,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const create = useCreateInvoice(estimateId);

  const [mode, setMode] = useState<Mode>("remaining");
  const [pct, setPct] = useState(String(Math.round(defaultDepositPct * 100)));
  const [flat, setFlat] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [terms, setTerms] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("remaining");
      setPct(String(Math.round(defaultDepositPct * 100)));
      setFlat("0");
      setDueDate("");
      setMemo("");
      setCoverNote("");
      setTerms("");
      setShowMore(false);
    }
  }, [open, defaultDepositPct]);

  if (!open) return null;

  const amount =
    mode === "remaining"
      ? round2(unbilled)
      : mode === "pct"
        ? round2((unbilled * (parseFloat(pct) || 0)) / 100)
        : round2(parseFloat(flat) || 0);

  const leaves = round2(unbilled - amount);
  const overBill = amount > unbilled + 0.005;
  const canSubmit = amount > 0 && !overBill && !create.isPending;

  async function onCreate() {
    try {
      const created = await create.mutateAsync({
        amount,
        memo: memo.trim() || undefined,
        dueDate: dueDate
          ? new Date(`${dueDate}T00:00:00`).toISOString()
          : undefined,
        coverNote: coverNote.trim() || undefined,
        terms: terms.trim() || undefined,
      });
      showToast("Invoice draft created");
      onClose();
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-invoice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[480px] w-[calc(100%-32px)] shadow-2xl">
        <h2
          id="create-invoice-title"
          className="text-[20px] font-[700] tracking-[-0.02em] mb-4"
        >
          New invoice
        </h2>

        <span className={labelCls}>Bill by</span>
        <div className="flex border border-[var(--line-2)] rounded overflow-hidden mb-3">
          {(
            [
              ["remaining", "Remaining balance"],
              ["pct", "% of balance"],
              ["flat", "Flat amount"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 text-[12px] py-2 ${
                mode === m
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "bg-[var(--surface)] text-[var(--ink-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "pct" ? (
          <div className="flex items-center gap-2 mb-3">
            <input
              aria-label="Percent of balance"
              type="number"
              className="w-[100px] text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded focus:outline-none focus:border-[var(--ink)]"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
            <span className="text-[13px] text-[var(--ink-2)]">
              % of {fmtDollar(unbilled)} remaining
            </span>
          </div>
        ) : null}

        {mode === "flat" ? (
          <>
            <label className={labelCls} htmlFor="flat-amount">
              Amount
            </label>
            <input
              id="flat-amount"
              aria-label="Amount"
              type="number"
              className={inputCls}
              value={flat}
              onChange={(e) => setFlat(e.target.value)}
            />
          </>
        ) : null}

        <div className="rounded bg-[var(--surface-2)] px-3 py-2.5 mb-4">
          <div className="text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)]">
            This invoice
          </div>
          <div className="text-[22px] font-[700] tracking-[-0.02em]">
            {fmtDollar(amount)}
          </div>
          {overBill ? (
            <div className="text-[11px] text-[var(--accent)] mt-0.5">
              Exceeds the {fmtDollar(unbilled)} unbilled balance.
            </div>
          ) : (
            <div className="text-[11px] text-[var(--muted)] mt-0.5">
              Leaves {fmtDollar(leaves)} unbilled
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} htmlFor="due-date">
              Due date (optional)
            </label>
            <input
              id="due-date"
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="memo">
              Memo (optional)
            </label>
            <input
              id="memo"
              type="text"
              className={inputCls}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Deposit"
            />
          </div>
        </div>

        <button
          type="button"
          className="text-[12px] text-[var(--accent)] mb-3"
          onClick={() => setShowMore((s) => !s)}
        >
          {showMore ? "− Cover note & terms" : "+ Cover note & terms"}
        </button>
        {showMore ? (
          <>
            <label className={labelCls} htmlFor="cover-note">
              Cover note
            </label>
            <textarea
              id="cover-note"
              className={`${inputCls} min-h-[70px] resize-y`}
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
            />
            <label className={labelCls} htmlFor="terms">
              Terms
            </label>
            <textarea
              id="terms"
              className={`${inputCls} min-h-[70px] resize-y`}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </>
        ) : null}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onCreate}
            disabled={!canSubmit}
            type="button"
          >
            {create.isPending ? "Creating…" : "Create draft →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run __tests__/components/invoices/CreateInvoiceDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add components/invoices/CreateInvoiceDialog.tsx __tests__/components/invoices/CreateInvoiceDialog.test.tsx
git commit -m "feat(invoicing): create-invoice dialog (remaining/%/flat with live preview)"
```

---

## Phase E — Invoice detail page + action dialogs

### Task 9: Invoice detail page + `InvoiceDetail`

**Files:**
- Create: `app/(app)/invoices/[id]/page.tsx`
- Create: `components/invoices/InvoiceDetail.tsx`

> **Why the `(app)` route group:** the estimate detail page lives at `app/(app)/estimates/[id]/page.tsx`. The `(app)` group provides the authenticated shell and the `ToastProvider` that `useToast` depends on. The invoice page MUST live under `(app)` too — placing it at `app/invoices/[id]` would render outside that provider and crash `useToast`. The `(app)` group is not part of the URL, so the route is still `/invoices/[id]`.

- [ ] **Step 1: Server page**

Create `app/(app)/invoices/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";
import { getInvoice } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoicePage({ params }: Props) {
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();

  const orgId = await getOrgId();
  const invoice = await getInvoice(invoiceId, orgId);
  if (!invoice) notFound();

  return <InvoiceDetail invoiceId={invoiceId} estimateId={invoice.estimateId} />;
}
```

- [ ] **Step 2: Detail component**

Create `components/invoices/InvoiceDetail.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import { VoidInvoiceDialog } from "@/components/invoices/VoidInvoiceDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { type InvoiceDetail as Invoice, useInvoice } from "@/lib/hooks/useInvoices";
import { fmtDollar } from "@/lib/utils";

function paidTotal(inv: Invoice): number {
  return inv.payments.reduce((s, p) => s + p.amount, 0);
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US") : "—";
}

const cardCls =
  "border border-[var(--line)] rounded-lg p-4 bg-[var(--paper)] mb-4";
const cardLabelCls =
  "text-[10px] font-[var(--font-mono)] uppercase tracking-[.07em] text-[var(--muted)] mb-2.5";

export function InvoiceDetail({
  invoiceId,
  estimateId,
}: {
  invoiceId: number;
  estimateId: number;
}) {
  const { data: inv, isLoading, error } = useInvoice(invoiceId);
  const { showToast } = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  if (isLoading) return <p className="p-8 text-[13px]">Loading…</p>;
  if (error || !inv)
    return (
      <p className="p-8 text-[13px] text-[var(--accent)]">
        {(error as Error)?.message ?? "Not found"}
      </p>
    );

  const paid = paidTotal(inv);
  const outstanding = Math.round((inv.amount - paid) * 100) / 100;
  const lines = inv.snapshot?.lines ?? [];
  const isVoid = inv.status === "void";
  const isDraft = inv.status === "draft";
  const isPaid = inv.status === "paid";
  const canPay = !isDraft && !isVoid && !isPaid;

  async function copyLink() {
    if (!inv?.publicToken) return;
    const url = `${window.location.origin}/invoice-review/${inv.publicToken}`;
    await navigator.clipboard.writeText(url);
    showToast("Public link copied");
  }

  return (
    <main className="max-w-[820px] mx-auto p-8">
      <Link
        href={`/estimates/${estimateId}`}
        className="text-[12px] text-[var(--accent)]"
      >
        ← Estimate
      </Link>

      <div className="flex items-start gap-3 mt-2 mb-1">
        <h1 className="text-[24px] font-[700] tracking-[-0.02em]">
          Invoice #{inv.invoiceNumber}
        </h1>
        <span className="self-center text-[10px] uppercase tracking-[.05em] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-2)]">
          {inv.status}
        </span>
        <div className="ml-auto text-right">
          <div className="text-[24px] font-[700]">{fmtDollar(inv.amount)}</div>
          {inv.dueDate ? (
            <div className="text-[11px] text-[var(--accent)]">
              Due {fmtDate(inv.dueDate)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-[12px] text-[var(--muted)] mb-5">
        {inv.sentToEmail ? <>Sent to {inv.sentToEmail} · </> : null}
        {inv.publicToken ? (
          <button type="button" onClick={copyLink} className="text-[var(--accent)] underline">
            copy public link
          </button>
        ) : null}
      </div>

      {!isVoid ? (
        <div className="flex gap-2 flex-wrap mb-6">
          {isDraft ? (
            <Button variant="primary" size="sm" type="button" onClick={() => setSendOpen(true)}>
              Send
            </Button>
          ) : null}
          {canPay ? (
            <Button variant="primary" size="sm" type="button" onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
          ) : null}
          {!isDraft ? (
            <Button variant="default" size="sm" type="button" onClick={() => setSendOpen(true)}>
              Resend
            </Button>
          ) : null}
          {!isPaid ? (
            <Button variant="ghost" size="sm" type="button" onClick={() => setVoidOpen(true)}>
              Void
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="text-[12px] text-[var(--muted)] mb-6">
          This invoice was voided on {fmtDate(inv.voidedAt)}.
        </div>
      )}

      <div className="flex gap-5 items-start flex-col md:flex-row">
        <div className="flex-[1.4] w-full">
          <div className={cardCls}>
            <div className={cardLabelCls}>Breakdown (from estimate)</div>
            {lines.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">
                Line breakdown is captured when the invoice is sent.
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {lines.map((l, i) => (
                    <tr
                      key={`${l.name}-${i}`}
                      className="border-b border-[var(--line)] last:border-b-0"
                    >
                      <td className="py-2">
                        <div className="font-[600]">{l.name}</div>
                        {l.description ? (
                          <div className="text-[11px] text-[var(--muted)]">
                            {l.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">{fmtDollar(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex justify-between font-[700] text-[15px] border-t border-[var(--line-2)] mt-2 pt-2">
              <span>Balance due</span>
              <span>{fmtDollar(inv.amount)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full">
          <div className={cardCls}>
            <div className={cardLabelCls}>Payments</div>
            <div className="flex justify-between text-[12px] rounded bg-[var(--surface-2)] px-2.5 py-2 mb-2.5">
              <span>Outstanding</span>
              <strong>{fmtDollar(outstanding)}</strong>
            </div>
            {inv.payments.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">No payments yet.</p>
            ) : (
              inv.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between text-[12.5px] py-1.5 border-b border-[var(--line)] last:border-b-0"
                >
                  <div>
                    {fmtDollar(p.amount)}
                    <div className="text-[11px] text-[var(--muted)]">
                      {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                  </div>
                  <div>{fmtDate(p.paidAt)}</div>
                </div>
              ))
            )}
          </div>

          <div className={cardCls}>
            <div className={cardLabelCls}>Activity</div>
            {inv.invoiceEvents.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">No activity yet.</p>
            ) : (
              <div className="border-l-2 border-[var(--line)] pl-3">
                {inv.invoiceEvents.map((e) => (
                  <div key={e.id} className="text-[11.5px] text-[var(--ink-2)] mb-2">
                    <span className="capitalize">{e.type.replace(/_/g, " ")}</span>
                    {e.actorName ? ` — ${e.actorName}` : ""} · {fmtDate(e.createdAt)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <SendInvoiceDialog
        invoiceId={inv.id}
        estimateId={estimateId}
        invoiceNumber={inv.invoiceNumber}
        customerEmail={inv.sentToEmail}
        alreadySent={!isDraft}
        open={sendOpen}
        onClose={() => setSendOpen(false)}
      />
      <RecordPaymentDialog
        invoiceId={inv.id}
        estimateId={estimateId}
        outstanding={outstanding}
        open={payOpen}
        onClose={() => setPayOpen(false)}
      />
      <VoidInvoiceDialog
        invoiceId={inv.id}
        estimateId={estimateId}
        invoiceNumber={inv.invoiceNumber}
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
      />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck (will fail until Tasks 10-12 exist)**

Run: `npm run typecheck`
Expected: errors only about the not-yet-created `SendInvoiceDialog` / `RecordPaymentDialog` / `VoidInvoiceDialog`. Proceed to Tasks 10-12, then re-run.

- [ ] **Step 4: Commit (after Tasks 10-12 make typecheck pass)**

```bash
git add "app/(app)/invoices/[id]/page.tsx" components/invoices/InvoiceDetail.tsx
git commit -m "feat(invoicing): invoice detail page — breakdown, payments, activity, actions"
```

---

### Task 10: `SendInvoiceDialog`

**Files:**
- Create: `components/invoices/SendInvoiceDialog.tsx`

- [ ] **Step 1: Implement**

Create `components/invoices/SendInvoiceDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useSendInvoice } from "@/lib/hooks/useInvoices";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const labelCls =
  "block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1";
const inputCls =
  "w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]";

interface Props {
  invoiceId: number;
  estimateId: number;
  invoiceNumber: number;
  customerEmail: string | null;
  alreadySent: boolean;
  open: boolean;
  onClose: () => void;
}

export function SendInvoiceDialog({
  invoiceId,
  estimateId,
  invoiceNumber,
  customerEmail,
  alreadySent,
  open,
  onClose,
}: Props) {
  const send = useSendInvoice(invoiceId, estimateId);
  const { showToast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (open) {
      setTo(customerEmail ?? "");
      setSubject(`Invoice #${invoiceNumber}`);
    }
  }, [open, customerEmail, invoiceNumber]);

  if (!open) return null;

  const canSend = isEmail(to) && subject.trim().length > 0 && !send.isPending;

  async function onSend() {
    try {
      await send.mutateAsync({ to: to.trim(), subject: subject.trim() });
      showToast(alreadySent ? "Invoice resent" : "Invoice sent");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-invoice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[460px] w-[calc(100%-32px)] shadow-2xl">
        <h2
          id="send-invoice-title"
          className="text-[20px] font-[700] tracking-[-0.02em] mb-4"
        >
          {alreadySent ? "Resend invoice" : "Send invoice to customer"}
        </h2>

        <label className={labelCls} htmlFor="inv-send-to">
          To
        </label>
        <input
          id="inv-send-to"
          type="email"
          className={inputCls}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="janet@example.com"
        />

        <label className={labelCls} htmlFor="inv-send-subject">
          Subject
        </label>
        <input
          id="inv-send-subject"
          type="text"
          className={inputCls}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSend}
            disabled={!canSend}
            type="button"
          >
            {send.isPending ? "Sending…" : alreadySent ? "Resend →" : "Send →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/invoices/SendInvoiceDialog.tsx
git commit -m "feat(invoicing): send-invoice dialog (to + subject)"
```

---

### Task 11: `RecordPaymentDialog`

**Files:**
- Create: `components/invoices/RecordPaymentDialog.tsx`
- Test: `__tests__/components/invoices/RecordPaymentDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/invoices/RecordPaymentDialog.test.tsx`:

```tsx
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("RecordPaymentDialog", () => {
  it("defaults the amount to the full outstanding balance", () => {
    render(
      wrap(
        <RecordPaymentDialog
          invoiceId={1}
          estimateId={2}
          outstanding={2400}
          open
          onClose={() => {}}
        />
      )
    );
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(input.value).toBe("2400");
  });

  it("does not offer stripe as a manual method", () => {
    render(
      wrap(
        <RecordPaymentDialog
          invoiceId={1}
          estimateId={2}
          outstanding={2400}
          open
          onClose={() => {}}
        />
      )
    );
    const select = screen.getByLabelText("Method") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain("stripe");
    expect(values).toContain("check");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/invoices/RecordPaymentDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/invoices/RecordPaymentDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRecordPayment } from "@/lib/hooks/useInvoices";

// stripe is intentionally excluded — manual entry only (Stripe is a future integration).
const METHODS = ["check", "cash", "card", "ach", "other"] as const;

const labelCls =
  "block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1";
const inputCls =
  "w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]";

interface Props {
  invoiceId: number;
  estimateId: number;
  outstanding: number;
  open: boolean;
  onClose: () => void;
}

export function RecordPaymentDialog({
  invoiceId,
  estimateId,
  outstanding,
  open,
  onClose,
}: Props) {
  const record = useRecordPayment(invoiceId, estimateId);
  const { showToast } = useToast();
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<string>("check");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(String(outstanding));
      setMethod("check");
      setPaidAt("");
      setReference("");
      setNote("");
    }
  }, [open, outstanding]);

  if (!open) return null;

  const value = parseFloat(amount) || 0;
  const canSubmit = value > 0 && !record.isPending;

  async function onSubmit() {
    try {
      await record.mutateAsync({
        amount: value,
        method,
        paidAt: paidAt ? new Date(`${paidAt}T00:00:00`).toISOString() : undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      showToast("Payment recorded");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to record payment");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[440px] w-[calc(100%-32px)] shadow-2xl">
        <h2
          id="record-payment-title"
          className="text-[20px] font-[700] tracking-[-0.02em] mb-4"
        >
          Record payment
        </h2>

        <label className={labelCls} htmlFor="pay-amount">
          Amount
        </label>
        <input
          id="pay-amount"
          aria-label="Amount"
          type="number"
          className={inputCls}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <label className={labelCls} htmlFor="pay-method">
          Method
        </label>
        <select
          id="pay-method"
          aria-label="Method"
          className={inputCls}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className={labelCls} htmlFor="pay-date">
          Date (optional — defaults to today)
        </label>
        <input
          id="pay-date"
          type="date"
          className={inputCls}
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
        />

        <label className={labelCls} htmlFor="pay-ref">
          Reference (optional)
        </label>
        <input
          id="pay-ref"
          type="text"
          className={inputCls}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Check #1182"
        />

        <label className={labelCls} htmlFor="pay-note">
          Note (optional)
        </label>
        <textarea
          id="pay-note"
          className={`${inputCls} min-h-[60px] resize-y`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!canSubmit}
            type="button"
          >
            {record.isPending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run __tests__/components/invoices/RecordPaymentDialog.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/invoices/RecordPaymentDialog.tsx __tests__/components/invoices/RecordPaymentDialog.test.tsx
git commit -m "feat(invoicing): record-payment dialog (defaults to outstanding, no stripe)"
```

---

### Task 12: `VoidInvoiceDialog`

**Files:**
- Create: `components/invoices/VoidInvoiceDialog.tsx`

- [ ] **Step 1: Implement**

Create `components/invoices/VoidInvoiceDialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useVoidInvoice } from "@/lib/hooks/useInvoices";

interface Props {
  invoiceId: number;
  estimateId: number;
  invoiceNumber: number;
  open: boolean;
  onClose: () => void;
}

export function VoidInvoiceDialog({
  invoiceId,
  estimateId,
  invoiceNumber,
  open,
  onClose,
}: Props) {
  const voidInvoice = useVoidInvoice(invoiceId, estimateId);
  const { showToast } = useToast();

  if (!open) return null;

  async function onConfirm() {
    try {
      await voidInvoice.mutateAsync();
      showToast("Invoice voided");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to void");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-invoice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[400px] w-[calc(100%-32px)] shadow-2xl">
        <h2
          id="void-invoice-title"
          className="text-[18px] font-[700] tracking-[-0.02em] mb-2"
        >
          Void invoice #{invoiceNumber}?
        </h2>
        <p className="text-[13px] text-[var(--ink-2)] mb-5">
          This can&apos;t be undone. The invoice will be excluded from billing
          totals.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={onConfirm}
            disabled={voidInvoice.isPending}
            type="button"
          >
            {voidInvoice.isPending ? "Voiding…" : "Void invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the whole detail-page surface**

Run: `npm run typecheck`
Expected: no errors (Task 9's `InvoiceDetail` now resolves all three dialogs).

- [ ] **Step 3: Run all invoice component tests + lint**

Run: `npx vitest run __tests__/components/invoices && npx biome ci .`
Expected: PASS, no lint errors.

- [ ] **Step 4: Commit (and the deferred Task 9 commit)**

```bash
git add components/invoices/VoidInvoiceDialog.tsx "app/(app)/invoices/[id]/page.tsx" components/invoices/InvoiceDetail.tsx
git commit -m "feat(invoicing): void-invoice confirmation + wire detail page actions"
```

---

## Phase F — E2E

### Task 13: Invoice fixtures + create flow

**Files:**
- Modify: `tests/e2e/fixtures/seed.ts`
- Create: `tests/e2e/invoice-create.spec.ts`

- [ ] **Step 1: Add invoice seed helpers**

Append to `tests/e2e/fixtures/seed.ts`:

```ts
// ── invoices ─────────────────────────────────────────────────────────────────

/** Create an invoice for an estimate via the API (flat amount). */
export async function seedInvoice(
  request: APIRequestContext,
  estimateId: number,
  args: { amount?: number; pct?: number } = {}
): Promise<{ invoiceId: number }> {
  const data =
    args.amount !== undefined
      ? { amount: args.amount }
      : { pct: args.pct ?? 0.5 };
  const res = await request.post(`/api/estimates/${estimateId}/invoices`, {
    data,
  });
  expect(res.status()).toBe(201);
  const invoice = await res.json();
  return { invoiceId: invoice.id };
}
```

- [ ] **Step 2: Write the create-flow spec**

Create `tests/e2e/invoice-create.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

test.describe.serial("Invoice create", () => {
  let ctx: BrowserContext;
  let estimateId: number;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const seed = await seedEstimateWithLineItem(ctx.request, siteMeasureId);
    estimateId = seed.estimateId;
    // give the line item a quantity so the estimate has a non-zero total
    const get = await ctx.request.get(`/api/estimates/${estimateId}`);
    const est = await get.json();
    const li = est.lineItems[0];
    await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { lineItems: [{ ...li, qty: 100 }] },
    });
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test("POST creates a draft invoice (201) and it appears in the list", async () => {
    const res = await ctx.request.post(
      `/api/estimates/${estimateId}/invoices`,
      { data: { amount: 100 } }
    );
    expect(res.status()).toBe(201);
    const inv = await res.json();
    expect(inv.status).toBe("draft");

    const list = await ctx.request.get(
      `/api/estimates/${estimateId}/invoices`
    );
    const rows = await list.json();
    expect(rows.some((r: { id: number }) => r.id === inv.id)).toBe(true);
  });

  test("over-billing past the unbilled balance is rejected", async () => {
    const res = await ctx.request.post(
      `/api/estimates/${estimateId}/invoices`,
      { data: { amount: 99999 } }
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("the detail page renders the invoice", async () => {
    const created = await ctx.request.post(
      `/api/estimates/${estimateId}/invoices`,
      { data: { amount: 50 } }
    );
    const inv = await created.json();
    const page = await ctx.newPage();
    await page.goto(`/invoices/${inv.id}`);
    await expect(
      page.getByText(`Invoice #${inv.invoiceNumber}`)
    ).toBeVisible();
    await page.close();
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npx playwright test tests/e2e/invoice-create.spec.ts --workers=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/seed.ts tests/e2e/invoice-create.spec.ts
git commit -m "test(e2e): invoice create flow + seed helper"
```

---

### Task 14: Send flow

**Files:**
- Create: `tests/e2e/invoice-send.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/invoice-send.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe.serial("Invoice send", () => {
  let ctx: BrowserContext;
  let invoiceId: number;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const get = await ctx.request.get(`/api/estimates/${estimateId}`);
    const est = await get.json();
    await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { lineItems: [{ ...est.lineItems[0], qty: 100 }] },
    });
    invoiceId = (await seedInvoice(ctx.request, estimateId, { amount: 100 }))
      .invoiceId;
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test("sending flips the invoice to sent", async () => {
    const res = await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
      data: { to: "customer@example.com", subject: "Invoice #1" },
    });
    expect(res.status()).toBe(200);

    const get = await ctx.request.get(`/api/invoices/${invoiceId}`);
    const inv = await get.json();
    expect(inv.status).toBe("sent");
    expect(inv.sentToEmail).toBe("customer@example.com");
  });

  test("invalid email returns 400", async () => {
    const res = await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
      data: { to: "nope", subject: "x" },
    });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npx playwright test tests/e2e/invoice-send.spec.ts --workers=1`
Expected: PASS.

```bash
git add tests/e2e/invoice-send.spec.ts
git commit -m "test(e2e): invoice send flow"
```

---

### Task 15: Payment + void flow

**Files:**
- Create: `tests/e2e/invoice-payment.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/invoice-payment.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe.serial("Invoice payment", () => {
  let ctx: BrowserContext;
  let estimateId: number;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const ids = await createCustomerAndEstimate(ctx.request);
    const seed = await seedEstimateWithLineItem(ctx.request, ids.siteMeasureId);
    estimateId = seed.estimateId;
    const get = await ctx.request.get(`/api/estimates/${estimateId}`);
    const est = await get.json();
    await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { lineItems: [{ ...est.lineItems[0], qty: 100 }] },
    });
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test("partial then full payment drives partial → paid", async () => {
    const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
      amount: 100,
    });

    const p1 = await ctx.request.post(`/api/invoices/${invoiceId}/payments`, {
      data: { amount: 40, method: "check" },
    });
    expect(p1.status()).toBe(201);
    let inv = await (
      await ctx.request.get(`/api/invoices/${invoiceId}`)
    ).json();
    expect(inv.status).toBe("partial");

    const p2 = await ctx.request.post(`/api/invoices/${invoiceId}/payments`, {
      data: { amount: 60, method: "cash" },
    });
    expect(p2.status()).toBe(201);
    inv = await (await ctx.request.get(`/api/invoices/${invoiceId}`)).json();
    expect(inv.status).toBe("paid");
    expect(inv.paidAt).toBeTruthy();
  });

  test("void excludes the invoice from billing", async () => {
    const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
      amount: 50,
    });
    const res = await ctx.request.post(`/api/invoices/${invoiceId}/void`);
    expect(res.status()).toBe(200);
    const inv = await (
      await ctx.request.get(`/api/invoices/${invoiceId}`)
    ).json();
    expect(inv.status).toBe("void");
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npx playwright test tests/e2e/invoice-payment.spec.ts --workers=1`
Expected: PASS.

```bash
git add tests/e2e/invoice-payment.spec.ts
git commit -m "test(e2e): invoice partial/full payment + void"
```

---

### Task 16: Public invoice review hides markup

**Files:**
- Create: `tests/e2e/public-invoice-review.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/public-invoice-review.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe.serial("Public invoice review", () => {
  let ctx: BrowserContext;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const ids = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      ids.siteMeasureId
    );
    const est = await (
      await ctx.request.get(`/api/estimates/${estimateId}`)
    ).json();
    await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { markupPct: 25, lineItems: [{ ...est.lineItems[0], qty: 100 }] },
    });
    const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
      amount: 100,
    });
    await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
      data: { to: "customer@example.com", subject: "Invoice #1" },
    });
    const inv = await (
      await ctx.request.get(`/api/invoices/${invoiceId}`)
    ).json();
    token = inv.publicToken;
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test("public invoice shows balance due but never a Markup line", async () => {
    const page = await ctx.newPage();
    await page.goto(`/invoice-review/${token}`);
    await expect(page.getByText("Balance due")).toBeVisible();
    await expect(page.getByText("Markup", { exact: false })).toHaveCount(0);
    await expect(
      page.getByText("Labor & margin", { exact: false })
    ).toHaveCount(0);
    await page.close();
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npx playwright test tests/e2e/public-invoice-review.spec.ts --workers=1`
Expected: PASS.

```bash
git add tests/e2e/public-invoice-review.spec.ts
git commit -m "test(e2e): public invoice review hides markup"
```

---

## Final verification

- [ ] **Run the full unit/component suite:** `npm test` → all pass.
- [ ] **Run the invoice + estimate E2E:** `npx playwright test tests/e2e/invoice-create.spec.ts tests/e2e/invoice-send.spec.ts tests/e2e/invoice-payment.spec.ts tests/e2e/public-invoice-review.spec.ts tests/e2e/public-estimate-review.spec.ts --workers=1` → all pass.
- [ ] **Lint:** `npx biome ci .` → clean.
- [ ] **Typecheck:** `npm run typecheck` → clean.
```
