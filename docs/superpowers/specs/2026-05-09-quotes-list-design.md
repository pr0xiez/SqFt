# Quotes list — `/quotes` index route + Quotes nav tab

**Date:** 2026-05-09
**Roadmap parent:** [`2026-05-09-design-gap-roadmap-design.md`](./2026-05-09-design-gap-roadmap-design.md) — Tier 1, Gap #1
**Source design:** `design/SqFt - App.html` — `screen-quote-list` (HTML lines 671–698)

## Problem

There is `/quotes/[id]` but no global quotes list. Users can only reach a quote via its parent estimate, so a quote whose estimate they don't remember is effectively lost. There is also no Quotes tab in the desktop top nav or the mobile bottom nav, so the global view has no entry point even once it exists.

## Solution

Add a `/quotes` route rendering a list view with the columns `# | Customer | Estimate | Total | Status | Date`, a `SearchInput` over quote `#` / customer name / estimate `#`, and five status chips (`All / Draft / Sent / Accepted / Declined`). Add a `Quotes` tab to both desktop and mobile nav.

Per-quote totals are computed server-side and added to the list response as `total: number | null`. The list endpoint already exists; only its include + response shape change.

The `+ New Quote` button shown in the design HTML is **out of scope** here — it is the surface that Tier 1 Gap #7 (tie-to-estimate picker) will wire up. Adding it now would require either a stub route or pulling Gap #7 forward; both are worse than shipping a clean list now and adding the button alongside its picker.

## Components

### `lib/utils.ts` (modified)

Add a pure helper next to `computeEstimateTotal`:

```ts
export function quoteTotal(input: {
  lineItems: LineItemCalc[];
  estimate: { items: RoomItem[] };
  markupPct: number;
  taxRate: number;
}): number | null;
```

**Behavior:** returns `null` when `lineItems` is empty; otherwise:

1. `rooms` = `estimate.items.filter(i => i.type === "room")`.
2. `subtotal` = sum of `liSubtotal(li, rooms) ?? 0` across `lineItems`.
3. `total` = `subtotal × (1 + markupPct/100) × (1 + taxRate)`.

Returns a raw number — formatting (`fmtBig`) is the caller's job. The list view will format it; an API serializing it does not need a string.

### `lib/repositories/quoteRepo.ts` (modified)

Extend `listQuotes` so the include also fetches the data needed for total computation:

```ts
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
}
```

Update the existing `QuoteWithEstimateSummary` payload type to match. `listQuotesForEstimate` keeps its current narrower include — it is only used by the estimate-detail flow, which doesn't need totals in the list.

### `app/api/quotes/route.ts` (modified)

The `GET` handler maps each Prisma row to a `QuoteListItem` shape with a server-computed `total` and **strips** `lineItems` and `estimate.items` from the response (they are needed for the calculation but not for the rendered list — keeping them on the wire would bloat the payload):

```ts
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
```

(Final code may use a small named helper instead of an inline destructure; the contract above is the spec.)

### `lib/hooks/useQuotes.ts` (modified)

Extend `QuoteListItem` with one new field:

```ts
export interface QuoteListItem {
  // …existing fields…
  total: number | null;
}
```

No new hook is added — `useQuotes()` already exists and the only change is the row shape it resolves to. (The roadmap entry's claim that a new hook is needed predates this verification.)

### `components/quotes/filterQuotes.ts` (new)

Pure helper. Exists as its own module so it's unit-testable without rendering — same pattern as `filterCustomers` and `filterEstimates`.

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
): T[];
```

**Behavior:**

1. **Status filter** when `status !== "all"`: keep only quotes where `quote.status === status`.
2. **Query filter** when `query.trim()` non-empty:
   - Trim and lowercase the query once.
   - Strip a single leading `#` so `#7` and `7` match the same rows.
   - Match if any of the following contain the cleaned query (case-insensitive substring): `String(quote.quoteNumber)`, `String(quote.estimate.estimateNumber ?? quote.estimate.id)`, or `quote.estimate.customer.name`.
3. Both filters compose; either may be a no-op.

A quote whose `estimate.customer` is `null`/`undefined` is safely skipped on the customer-name check (does not crash, does not match a customer-name query).

No fuzzy matching, no whitespace tokenization. The list is small and client-side; substring + status flags are sufficient.

### `components/quotes/QuoteList.tsx` (new)

`QuoteListView` mirrors the structure of `components/estimates/EstimateList.tsx`:

- `useQuotes()` for data; `query` and `status` local state.
- Header: eyebrow `SqFt · Pricing`, h1 `Quotes`, `{n} quote(s)` subline. **No `+ New Quote` button** (deferred to Gap #7).
- Filter bar: `SearchInput` (placeholder `Search quote #, customer, estimate…`) followed by five chip buttons (`All / Draft / Sent / Accepted / Declined`) and a hidden-count `{filtered.length} shown` shown only when narrowing. Reuses the chip styling from `EstimateList.tsx` so the two list screens stay visually consistent.
- Table desktop columns: `# | Customer | Estimate | Total | Status | Date` using `hidden md:grid` with `grid-cols-[80px_1fr_140px_120px_110px_120px]` (final widths to be tuned during implementation).
- Mobile collapses to a single Customer column with secondary lines for total + status, matching the `EstimateList.tsx` collapse pattern.
- Status pill: a `<span>` styled per the design HTML's `.q-status` palette — `draft`=`var(--muted)`, `sent`=`var(--gold)`, `accepted`=`var(--sage)`, `declined`=`var(--accent)`. Implemented inline with Tailwind + CSS vars (no new component).
- Total cell: `fmtBig(total)` prefixed with `$`; renders `—` when `total` is `null`.
- Date cell: `new Date(quote.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })` — same call as `EstimateList`.
- Each row is a `<button>` that routes to `/quotes/${quote.id}` (mirrors EstimateList).
- Empty-state copy branches: `No quotes yet.` when `quotes.length === 0`; `No quotes match "{query}".` when a query is active and filtering empties the list; otherwise `No quotes match.`.

### `app/(app)/quotes/page.tsx` (new)

Trivial wrapper, mirrors `app/(app)/estimates/page.tsx`:

```tsx
import { QuoteListView } from "@/components/quotes/QuoteList";

export const metadata = { title: "Quotes — SqFt" };

export default function QuotesPage() {
  return <QuoteListView />;
}
```

### `components/ui/AppNav.tsx` (modified)

Three changes:

1. Insert `{ href: "/quotes", label: "Quotes", screen: "quote-list" }` into `NAV_TABS` between `Estimates` and `Schedule`.
2. Change the mobile bottom-nav grid from `grid-cols-4` to `grid-cols-5`.
3. Add a `Quotes` entry to the `NavIcon` icon map: a stroke-style document outline with a `$` glyph in its body, sharing the same SVG `props` (24×24 viewBox, current stroke width and linecap conventions) as the other icons. Visually distinct from the Estimates document icon.

`isActive("/quotes")` already works via the existing `pathname.startsWith(href)` rule, so quote-detail routes (`/quotes/[id]`) keep the tab highlighted.

## State and persistence

Local React state only. Not URL-synced. Matches the customers-search and estimates-search-filters precedents and the design (no router work in the prototype).

## Tests

New file: `__tests__/components/quotes/filterQuotes.test.ts`. Vitest-only; no React rendering needed. Cases:

1. Empty query and `status === "all"` returns the input unchanged.
2. `status === "draft"` keeps only draft quotes.
3. `status === "sent"` keeps only sent quotes.
4. `status === "accepted"` keeps only accepted quotes.
5. `status === "declined"` keeps only declined quotes.
6. Query matches by stringified `quoteNumber`.
7. Query matches `quoteNumber` with a leading `#`.
8. Query matches by `estimate.estimateNumber`.
9. Query falls back to `estimate.id` when `estimateNumber` is `null`.
10. Query matches `estimate.customer.name` case-insensitively.
11. Quote with `estimate.customer === null` is safely skipped on a customer-name query (no crash, no match).
12. Query and status compose (both must hold).
13. Query is trimmed before matching.
14. Returns `[]` when nothing matches.

No component tests for `QuoteListView`. The vitest config is `environment: "node"` and there is no jsdom or testing-library installed (same constraint documented in the customers-search and estimates-search-filters specs).

The `quoteTotal` helper is small and exercised end-to-end via the API in manual testing; if a future spec adds a quote-builder calculation refactor, that's the natural place to add direct unit tests for it.

## Out of scope

- `+ New Quote` button on the list — that's Gap #7 (tie-to-estimate picker).
- URL state for `query` or `status`.
- Debounce. The list is in-memory and small; instant filtering is fine.
- Keyboard shortcut (`/`) to focus the input.
- Fuzzy matching, tokenization, or scoring.
- Search highlighting in table rows.
- Searching across `address`, `phone`, `date`, or `status` text (the design HTML's prototype searches some of these; the roadmap scope is narrower, matching the customers-search/estimates-search-filters precedent).
- Sorting controls. Server-side `createdAt: "desc"` order is preserved.
- Direct unit tests for `quoteTotal` (covered by API/manual testing for this gap; can be added when a quote-builder refactor needs them).
- Mobile-specific behaviors beyond adding the Quotes tab to the bottom nav.

## Acceptance

- `/quotes` renders a table of all quotes for the current org with columns `# | Customer | Estimate | Total | Status | Date`.
- Typing in the search input filters the rendered table immediately.
- The five chips toggle between status states; clicking the active chip is a no-op (it stays selected).
- `#7` and `7` both match quote number 7.
- Status `Draft` returns only quotes whose `status === "draft"`; same for `Sent`, `Accepted`, `Declined`.
- A quote with no line items shows `—` in the Total column.
- A quote with line items shows the server-computed total formatted with `fmtBig` and a `$` prefix.
- "X shown" hidden-count appears whenever any filter is narrowing the list.
- Empty-state copy reflects whether a search query is active.
- Quotes tab appears in the desktop top nav between Estimates and Schedule, and in the mobile bottom nav as the fourth of five tabs (with a document+`$` icon).
- The Quotes tab stays highlighted on `/quotes` and on `/quotes/[id]`.
- `biome ci .` passes; `vitest` passes including the new `filterQuotes` tests.
