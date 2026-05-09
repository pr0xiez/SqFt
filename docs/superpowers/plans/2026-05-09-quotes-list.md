# Quotes List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/quotes` index route with a global Quotes table (`# | Customer | Estimate | Total | Status | Date`), search + 5 status chips, and a Quotes tab in both desktop and mobile nav. Per-quote totals are server-computed.

**Architecture:** Six-file change. Server side: a `quoteTotal` pure helper in `lib/utils.ts`, a wider `listQuotes` include in `lib/repositories/quoteRepo.ts`, and a mapping step in `app/api/quotes/route.ts`'s GET handler that adds `total: number | null` and strips line items + estimate items from the response. Client side: a pure `filterQuotes` helper (mirrors `filterCustomers` / `filterEstimates`), a new `QuoteListView` component, a thin page wrapper, and a `Quotes` tab added to `AppNav`. No schema change.

**Tech Stack:** React 19, Next.js (project's vendored fork — see `AGENTS.md`), TypeScript, Prisma + Postgres, Tailwind v4 with CSS variables (`--surface`, `--ink`, `--muted`, `--line`, `--ink-2`, `--surface-2`, `--bg`, `--gold`, `--sage`, `--accent`, `--font-mono`), Vitest (`environment: "node"`, no jsdom), Biome for lint.

**Spec:** `docs/superpowers/specs/2026-05-09-quotes-list-design.md`

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `lib/utils.ts` | **Modify** | Add a pure `quoteTotal()` helper next to `computeEstimateTotal`. Returns `number \| null`. |
| `lib/repositories/quoteRepo.ts` | **Modify** | Widen `listQuotes` include to fetch `lineItems` and `estimate.items` for total computation. Update `QuoteWithEstimateSummary` type. |
| `app/api/quotes/route.ts` | **Modify** | GET handler maps each quote to a list shape with `total`, stripping `lineItems` / `estimate.items` from the response. |
| `lib/hooks/useQuotes.ts` | **Modify** | Add `total: number \| null` to `QuoteListItem`. |
| `components/quotes/filterQuotes.ts` | **Create** | Pure helper that filters a `Quote[]` by query + status. Isolated for testability. |
| `__tests__/components/quotes/filterQuotes.test.ts` | **Create** | Vitest tests for the pure helper. |
| `components/quotes/QuoteList.tsx` | **Create** | `QuoteListView` — header, filter bar, table, mobile collapse, status pills, `—` for null totals. |
| `app/(app)/quotes/page.tsx` | **Create** | Trivial page wrapper rendering `QuoteListView`. |
| `components/ui/AppNav.tsx` | **Modify** | Insert Quotes tab into `NAV_TABS`, change mobile grid to `grid-cols-5`, add Quotes icon. |

---

## Task 1: `quoteTotal` pure helper

**Files:**
- Modify: `lib/utils.ts`

A small pure function next to `computeEstimateTotal`. The spec puts direct unit tests for this helper out of scope — it is exercised end-to-end through the API + manual browser check. Keep it side-effect-free so a future refactor can add tests without churn.

- [ ] **Step 1: Add the helper**

In `lib/utils.ts`, immediately after the existing `computeEstimateTotal` function, append:

```ts
/** Compute the total for a quote from its line items + the rooms it links into.
 *  Returns null when the quote has no line items.
 *  Server-side use: lib/repositories/quoteRepo.ts feeds this via the list API. */
export function quoteTotal(input: {
  lineItems: LineItemCalc[];
  estimate: { items: RoomItem[] };
  markupPct: number;
  taxRate: number;
}): number | null {
  if (input.lineItems.length === 0) return null;
  const rooms = input.estimate.items.filter(
    (i): i is RoomItem => i.type === "room"
  );
  const subtotal = input.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const beforeTax = subtotal * (1 + input.markupPct / 100);
  return beforeTax * (1 + input.taxRate);
}
```

`LineItemCalc`, `RoomItem`, and `liSubtotal` are already declared above in the same file — no new imports.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx biome ci lib/utils.ts`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts
git commit -m "feat(utils): add quoteTotal helper for list-side quote totals"
```

---

## Task 2: Server-side `total` in list response

**Files:**
- Modify: `lib/repositories/quoteRepo.ts`
- Modify: `app/api/quotes/route.ts`
- Modify: `lib/hooks/useQuotes.ts`

These three files change together because the wire shape is changing: the repository fetches more, the API computes + strips, and the client type adds `total`. Splitting them across commits would leave TypeScript intermittently broken.

- [ ] **Step 1: Widen the `listQuotes` include**

In `lib/repositories/quoteRepo.ts`, find the `QuoteWithEstimateSummary` type (around line 9):

```ts
export type QuoteWithEstimateSummary = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      select: {
        id: true;
        estimateNumber: true;
        title: true;
        customer: { select: { id: true; name: true; address: true } };
      };
    };
    _count: { select: { lineItems: true } };
  };
}>;
```

Replace with:

```ts
export type QuoteWithEstimateSummary = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      select: {
        id: true;
        estimateNumber: true;
        title: true;
        customer: { select: { id: true; name: true; address: true } };
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    _count: { select: { lineItems: true } };
  };
}>;
```

Then update the runtime `listQuotes` query to match (around line 69). Replace:

```ts
export async function listQuotes(
  orgId: string
): Promise<QuoteWithEstimateSummary[]> {
  return prisma.quote.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      estimate: {
        select: {
          id: true,
          estimateNumber: true,
          title: true,
          customer: { select: { id: true, name: true, address: true } },
        },
      },
      _count: { select: { lineItems: true } },
    },
  });
}
```

with:

```ts
export async function listQuotes(
  orgId: string
): Promise<QuoteWithEstimateSummary[]> {
  return prisma.quote.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      estimate: {
        select: {
          id: true,
          estimateNumber: true,
          title: true,
          customer: { select: { id: true, name: true, address: true } },
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      _count: { select: { lineItems: true } },
    },
  });
}
```

Leave `listQuotesForEstimate` untouched — it has the narrower include and its callers don't render totals.

- [ ] **Step 2: Compute total + strip in the API GET handler**

In `app/api/quotes/route.ts`, replace the existing `GET` handler:

```ts
export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const quotes = await listQuotes(orgId);
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});
```

with:

```ts
export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const quotes = await listQuotes(orgId);
    const out = quotes.map(({ lineItems, estimate, ...rest }) => {
      const { items, ...estimateRest } = estimate;
      return {
        ...rest,
        estimate: estimateRest,
        total: quoteTotal({
          lineItems,
          estimate: { items },
          markupPct: rest.markupPct,
          taxRate: rest.taxRate,
        }),
      };
    });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});
```

Add the import to the top of the same file:

```ts
import { quoteTotal } from "@/lib/utils";
```

The destructure `{ lineItems, estimate, ...rest }` strips the heavy fields; the response shape now matches the updated `QuoteListItem` (next step) including `total`.

- [ ] **Step 3: Add `total` to `QuoteListItem`**

In `lib/hooks/useQuotes.ts`, find the `QuoteListItem` interface (around line 13):

```ts
export interface QuoteListItem {
  id: number;
  orgId: string;
  estimateId: number;
  quoteNumber: number;
  status: string;
  date: string;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  createdAt: string;
  estimate: QuoteEstimateSummary;
  _count: { lineItems: number };
}
```

Add a new field after `_count`:

```ts
export interface QuoteListItem {
  id: number;
  orgId: string;
  estimateId: number;
  quoteNumber: number;
  status: string;
  date: string;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  createdAt: string;
  estimate: QuoteEstimateSummary;
  _count: { lineItems: number };
  total: number | null;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors. (TypeScript will fail loudly if the destructure / field names don't line up.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`

Expected: all existing tests still pass. None reference the old `QuoteListItem` shape so this should be green.

- [ ] **Step 6: Lint**

Run: `npx biome ci lib/repositories/quoteRepo.ts app/api/quotes/route.ts lib/hooks/useQuotes.ts`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/repositories/quoteRepo.ts app/api/quotes/route.ts lib/hooks/useQuotes.ts
git commit -m "feat(quotes): include server-computed total in list response"
```

---

## Task 3: Pure `filterQuotes` helper (TDD)

**Files:**
- Create: `components/quotes/filterQuotes.ts`
- Test: `__tests__/components/quotes/filterQuotes.test.ts`

Mirrors `filterEstimates`. Pure data → testable in isolation under Vitest's node env.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/quotes/filterQuotes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterQuotes } from "@/components/quotes/filterQuotes";

type Q = {
  id: number;
  quoteNumber: number;
  status: string;
  estimate: {
    id: number;
    estimateNumber?: number | null;
    customer?: { name: string } | null | undefined;
  };
};

const sample: Q[] = [
  {
    id: 101,
    quoteNumber: 7,
    status: "draft",
    estimate: { id: 11, estimateNumber: 5, customer: { name: "Alice Smith" } },
  },
  {
    id: 102,
    quoteNumber: 8,
    status: "sent",
    estimate: { id: 12, estimateNumber: 6, customer: { name: "Bob Jones" } },
  },
  {
    id: 103,
    quoteNumber: 9,
    status: "accepted",
    estimate: { id: 13, estimateNumber: null, customer: { name: "Carol Lee" } },
  },
  {
    id: 104,
    quoteNumber: 10,
    status: "declined",
    estimate: { id: 14, estimateNumber: 8, customer: null },
  },
];

describe("filterQuotes", () => {
  it("returns input unchanged when query is empty and status is 'all'", () => {
    expect(filterQuotes(sample, "", "all")).toEqual(sample);
  });

  it("status='draft' keeps only draft quotes", () => {
    expect(filterQuotes(sample, "", "draft").map((q) => q.id)).toEqual([101]);
  });

  it("status='sent' keeps only sent quotes", () => {
    expect(filterQuotes(sample, "", "sent").map((q) => q.id)).toEqual([102]);
  });

  it("status='accepted' keeps only accepted quotes", () => {
    expect(filterQuotes(sample, "", "accepted").map((q) => q.id)).toEqual([
      103,
    ]);
  });

  it("status='declined' keeps only declined quotes", () => {
    expect(filterQuotes(sample, "", "declined").map((q) => q.id)).toEqual([
      104,
    ]);
  });

  it("query matches by stringified quoteNumber", () => {
    expect(filterQuotes(sample, "7", "all").map((q) => q.id)).toEqual([101]);
  });

  it("query handles a leading '#'", () => {
    expect(filterQuotes(sample, "#7", "all").map((q) => q.id)).toEqual([101]);
  });

  it("query matches by estimate.estimateNumber", () => {
    expect(filterQuotes(sample, "6", "all").map((q) => q.id)).toEqual([102]);
  });

  it("query falls back to estimate.id when estimateNumber is null", () => {
    expect(filterQuotes(sample, "13", "all").map((q) => q.id)).toEqual([103]);
  });

  it("query matches customer name case-insensitively", () => {
    expect(filterQuotes(sample, "ALICE", "all").map((q) => q.id)).toEqual([
      101,
    ]);
  });

  it("safely skips a missing customer on a customer-name query", () => {
    // 104 has customer: null. A query like "smith" must not crash and must not match it.
    const result = filterQuotes(sample, "smith", "all");
    expect(result.map((q) => q.id)).toEqual([101]);
  });

  it("composes query and status (both must hold)", () => {
    // quoteNumber 7 exists (Alice, draft). With status='sent' it must drop.
    expect(filterQuotes(sample, "7", "sent")).toEqual([]);
  });

  it("trims whitespace from the query before matching", () => {
    expect(filterQuotes(sample, "   alice   ", "all").map((q) => q.id)).toEqual(
      [101]
    );
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterQuotes(sample, "zzz-no-match", "all")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/components/quotes/filterQuotes.test.ts`

Expected: all tests fail with `Failed to resolve import "@/components/quotes/filterQuotes"`.

- [ ] **Step 3: Write the minimal implementation**

Create `components/quotes/filterQuotes.ts`:

```ts
export type QuoteStatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "accepted"
  | "declined";

export type QuoteFilterInput = {
  id: number;
  quoteNumber: number;
  status: string;
  estimate: {
    id: number;
    estimateNumber?: number | null;
    customer?: { name: string } | null | undefined;
  };
};

export function filterQuotes<T extends QuoteFilterInput>(
  quotes: T[],
  query: string,
  status: QuoteStatusFilter
): T[] {
  const cleaned = query.trim().toLowerCase().replace(/^#/, "");
  return quotes.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (cleaned.length === 0) return true;

    const quoteNumStr = String(q.quoteNumber);
    if (quoteNumStr.includes(cleaned)) return true;

    const estimateLabel = String(q.estimate.estimateNumber ?? q.estimate.id);
    if (estimateLabel.includes(cleaned)) return true;

    const customerName = q.estimate.customer?.name ?? "";
    if (customerName.toLowerCase().includes(cleaned)) return true;

    return false;
  });
}
```

The generic `T extends QuoteFilterInput` lets callers pass the full `QuoteListItem` (with `total`, `_count`, etc.) and get the same shape back — no widening.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/components/quotes/filterQuotes.test.ts`

Expected: all 14 tests pass.

- [ ] **Step 5: Lint**

Run: `npx biome ci components/quotes/filterQuotes.ts __tests__/components/quotes/filterQuotes.test.ts`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/quotes/filterQuotes.ts __tests__/components/quotes/filterQuotes.test.ts
git commit -m "feat(quotes): add filterQuotes helper for query+status filtering"
```

---

## Task 4: `QuoteListView` component + page wrapper

**Files:**
- Create: `components/quotes/QuoteList.tsx`
- Create: `app/(app)/quotes/page.tsx`

`QuoteListView` mirrors `EstimateListView` structurally so the two screens stay visually consistent. The page wrapper is trivial — same pattern as `app/(app)/estimates/page.tsx`.

- [ ] **Step 1: Create the component**

Create `components/quotes/QuoteList.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  filterQuotes,
  type QuoteStatusFilter,
} from "@/components/quotes/filterQuotes";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { fmtBig } from "@/lib/utils";

const STATUS_FILTERS: { value: QuoteStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

const STATUS_PILL_COLOR: Record<string, string> = {
  draft: "text-[var(--muted)]",
  sent: "text-[var(--gold)]",
  accepted: "text-[var(--sage)]",
  declined: "text-[var(--accent)]",
};

export function QuoteListView() {
  const router = useRouter();
  const { data: quotes = [], isLoading } = useQuotes();
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<QuoteStatusFilter>("all");

  const filtered = filterQuotes(quotes, query, status);
  const isNarrowed = filtered.length !== quotes.length;
  const trimmedQuery = query.trim();

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            SqFt · Pricing
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Quotes
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {quotes.length} quote{quotes.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search quote #, customer, estimate…"
        />
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={cn(
              "font-[var(--font-mono)] text-[11px] px-3 py-1.5 border rounded-[6px] cursor-pointer transition-colors duration-150",
              status === value
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
            )}
          >
            {label}
          </button>
        ))}
        {isNarrowed && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] ml-auto">
            {filtered.length} shown
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row (desktop only) */}
        <div className="hidden md:grid grid-cols-[80px_1fr_120px_120px_110px_110px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          {["#", "Customer", "Estimate", "Total", "Status", "Date"].map(
            (h) => (
              <div
                key={h}
                className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
              >
                {h}
              </div>
            )
          )}
        </div>

        {isLoading ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No quotes yet.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {trimmedQuery.length > 0
              ? `No quotes match "${trimmedQuery}".`
              : "No quotes match."}
          </div>
        ) : (
          filtered.map((q) => {
            const customer = q.estimate.customer;
            const estimateLabel = `#${q.estimate.estimateNumber ?? q.estimate.id}`;
            const totalLabel =
              q.total === null ? "—" : `$${fmtBig(q.total)}`;
            const pillColor =
              STATUS_PILL_COLOR[q.status] ?? "text-[var(--muted)]";

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => router.push(`/quotes/${q.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_120px_120px_110px_110px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
              >
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span className="font-[var(--font-mono)] text-[13px] font-[600]">
                    #{q.quoteNumber}
                  </span>
                </div>
                <div className="px-3.5 py-3.5">
                  <div className="text-[14px] font-[600] tracking-[-0.01em]">
                    {customer?.name ?? "—"}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap md:hidden">
                    #{q.quoteNumber} · {totalLabel} ·{" "}
                    <span className={pillColor}>{q.status}</span>
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap hidden md:block">
                    {customer?.address ?? ""}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <div className="font-[var(--font-mono)] text-[13px]">
                    {estimateLabel}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <div className="text-[13px] font-[600]">{totalLabel}</div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span
                    className={cn(
                      "inline-block font-[var(--font-mono)] text-[9px] px-2 py-[3px] border rounded-[4px] tracking-[.04em] font-[500] capitalize",
                      pillColor,
                      "border-current"
                    )}
                  >
                    {q.status}
                  </span>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                  {new Date(q.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
```

Notes for the implementer:
- `fmtBig` is already exported from `lib/utils.ts` and is what `computeEstimateTotal` formats with — using it here keeps the two list screens consistent.
- The mobile collapse mirrors `EstimateList`: only the Customer column renders on mobile, with a secondary line that pulls in `#`, total, and status so all the row's information is reachable at narrow widths.
- The status pill uses the design HTML's `.q-status` palette via `STATUS_PILL_COLOR`. `border-current` means the border tracks the same colour as the text, exactly as the design CSS does (`border:1px solid currentColor`).
- The `+ New Quote` button is intentionally absent — Gap #7 will add it together with its picker.

- [ ] **Step 2: Create the page wrapper**

Create `app/(app)/quotes/page.tsx`:

```tsx
import { QuoteListView } from "@/components/quotes/QuoteList";

export const metadata = { title: "Quotes — SqFt" };

export default function QuotesPage() {
  return <QuoteListView />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npx biome ci components/quotes/QuoteList.tsx app/(app)/quotes/page.tsx`

Expected: no errors. (If biome complains about the parens in the path, omit the path argument and run `npx biome ci .` — it will pick up the new files via the project config.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`

Expected: all tests pass (no new tests in this task; the `filterQuotes` tests from Task 3 still pass).

- [ ] **Step 6: Commit**

```bash
git add components/quotes/QuoteList.tsx "app/(app)/quotes/page.tsx"
git commit -m "feat(quotes): add /quotes index route and QuoteListView"
```

(The double quotes around the page path are needed because PowerShell expands parentheses; do not omit them.)

---

## Task 5: Quotes tab in `AppNav`

**Files:**
- Modify: `components/ui/AppNav.tsx`

Three small changes: insert the tab, grow the mobile grid, add the icon.

- [ ] **Step 1: Insert the Quotes tab in `NAV_TABS`**

In `components/ui/AppNav.tsx`, find the `NAV_TABS` constant (around line 8):

```ts
const NAV_TABS = [
  { href: "/", label: "Dashboard", screen: "dashboard" },
  { href: "/customers", label: "Customers", screen: "customers" },
  { href: "/estimates", label: "Estimates", screen: "estimates" },
  { href: "/schedule", label: "Schedule", screen: "schedule" },
];
```

Replace with:

```ts
const NAV_TABS = [
  { href: "/", label: "Dashboard", screen: "dashboard" },
  { href: "/customers", label: "Customers", screen: "customers" },
  { href: "/estimates", label: "Estimates", screen: "estimates" },
  { href: "/quotes", label: "Quotes", screen: "quote-list" },
  { href: "/schedule", label: "Schedule", screen: "schedule" },
];
```

The existing `isActive` function uses `pathname.startsWith(href)` so `/quotes/[id]` will keep the Quotes tab highlighted automatically.

- [ ] **Step 2: Grow the mobile grid to 5 columns**

Find the mobile bottom-nav grid wrapper (around line 84):

```tsx
<div className="grid grid-cols-4 gap-0.5 max-w-[520px] mx-auto">
```

Change `grid-cols-4` to `grid-cols-5`:

```tsx
<div className="grid grid-cols-5 gap-0.5 max-w-[520px] mx-auto">
```

- [ ] **Step 3: Add the Quotes icon**

Find the `icons` map inside `NavIcon` (around line 127). Add a `Quotes` entry between `Estimates` and `Schedule`:

```tsx
const icons: Record<string, React.ReactNode> = {
  Dashboard: (
    <svg {...props}>
      <title>{label}</title>
      <path d="M3 12L12 4l9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  ),
  Customers: (
    <svg {...props}>
      <title>{label}</title>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  ),
  Estimates: (
    <svg {...props}>
      <title>{label}</title>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  ),
  Quotes: (
    <svg {...props}>
      <title>{label}</title>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M12 7v10" />
      <path d="M14.5 9.5c-.7-.7-1.7-.9-2.5-.5-1 .5-1.2 1.7-.4 2.3.7.5 1.7.5 2.4 1 .8.6.6 1.8-.4 2.3-.8.4-1.8.2-2.5-.5" />
    </svg>
  ),
  Schedule: (
    <svg {...props}>
      <title>{label}</title>
      <rect x="4" y="5" width="16" height="15" rx="1.5" />
      <path d="M4 9h16M9 3v4M15 3v4" />
    </svg>
  ),
};
```

The `Quotes` icon is a document outline (matching `Estimates`) with an `S`-shaped stroke approximating a `$` body and a vertical stem — visually distinct from the horizontal text lines on the Estimates icon.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npx biome ci components/ui/AppNav.tsx`

Expected: no errors.

- [ ] **Step 6: Manual browser check**

Per `AGENTS.md`, verify UI changes in a browser before claiming done.

1. Start the dev server: `npm run dev`
2. Open the app.
3. **Desktop nav:**
   - Verify a `Quotes` tab appears between `Estimates` and `Schedule` in the top nav.
   - Click it — URL becomes `/quotes`, table renders.
   - Click into any row — URL becomes `/quotes/<id>`, the `Quotes` tab stays highlighted (the underline stays under it).
4. **Mobile nav** (resize the window below the `md` breakpoint or use device emulator):
   - Verify the bottom nav now shows 5 evenly-spaced tabs: Dashboard / Customers / Estimates / Quotes / Schedule.
   - Verify the Quotes icon is visually distinguishable from Estimates (document outline + a `$`-shaped stroke).
   - Tap each tab to confirm routing and active state.
5. **`/quotes` golden path:**
   - Header shows `SqFt · Pricing` / `Quotes` / `<n> quote(s)`.
   - Search field placeholder reads `Search quote #, customer, estimate…`.
   - Five chips appear: All / Draft / Sent / Accepted / Declined. `All` is active by default.
   - Each row shows `#`, customer name + address, estimate `#`, total (or `—`), status pill in the right colour, and date.
   - Type `#` followed by a quote number — only that quote remains.
   - Type a partial customer name — matching rows remain.
   - Click `Sent` chip — only sent quotes remain. `<n> shown` count appears at the right edge of the filter bar.
   - Type something that matches nothing (e.g. `zzz`) — empty-state shows `No quotes match "zzz".`
   - Click into a row — navigates to `/quotes/<id>` (existing builder still works).
6. **Edge case:**
   - Find a quote with zero line items (the seed should have at least one in `draft` status with no line items, or create one). Verify the Total column reads `—`.

- [ ] **Step 7: Commit**

```bash
git add components/ui/AppNav.tsx
git commit -m "feat(nav): add Quotes tab to desktop and mobile nav"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full lint per `AGENTS.md`**

Run: `npx biome ci .`

Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`

Expected: all tests pass, including the 14 new `filterQuotes` tests.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Confirm seed script doesn't need updates**

There is no schema change in this plan, so the seed script is unaffected. (`AGENTS.md` requires updating `prisma/seed.ts` only when the schema changes.)

- [ ] **Step 5: `git status` clean**

Run: `git status`

Expected: `nothing to commit, working tree clean`. Branch should be 5 commits ahead of `main`:
1. `feat(utils): add quoteTotal helper for list-side quote totals`
2. `feat(quotes): include server-computed total in list response`
3. `feat(quotes): add filterQuotes helper for query+status filtering`
4. `feat(quotes): add /quotes index route and QuoteListView`
5. `feat(nav): add Quotes tab to desktop and mobile nav`

- [ ] **Step 6: Push and open PR**

---

## Self-review notes

- **Spec coverage:** Every spec section maps to a task — `quoteTotal` (Task 1), `listQuotes` include + API mapping + `QuoteListItem.total` (Task 2), `filterQuotes` (Task 3), `QuoteListView` + page wrapper (Task 4), `AppNav` tab + grid + icon (Task 5), tests (Task 3), out-of-scope items intentionally absent (`+ New Quote` button, URL state, debounce, fuzzy matching, sorting controls).
- **Type consistency:** `QuoteStatusFilter`, `QuoteFilterInput`, and `filterQuotes` keep the same names and signatures across Tasks 3 and 4. `QuoteListItem.total: number | null` is defined in Task 2 step 3 and consumed in Task 4 (`q.total === null ? "—" : ...`). `quoteTotal` returns `number | null` (Task 1) and is consumed by Task 2 step 2.
- **Wire shape sync:** Tasks 2 step 1 (repo include), step 2 (API map), and step 3 (`QuoteListItem`) are batched in one commit on purpose — splitting them would leave TypeScript broken between commits.
- **No placeholders:** Each code step contains complete code. No `TBD`, no `similar to Task N` references without showing the code, no `add appropriate handling`.
- **`+ New Quote` deferred:** Spec puts it in Out of scope. No task adds it. Gap #7 will pick it up.
