# Estimates list — search input + status filters

**Date:** 2026-05-09
**Roadmap parent:** [`2026-05-09-design-gap-roadmap-design.md`](./2026-05-09-design-gap-roadmap-design.md) — Tier 1, Gap #3
**Source design:** `design/SqFt - App.html` — `screen-estlist` (HTML lines 641–668)

## Problem

The Estimates list (`components/estimates/EstimateList.tsx`) has neither text search nor status filters. As estimate count grows there's no way to find a specific record or to narrow down to estimates that are still drafts (no rooms), measured (rooms but no quote), or already quoted.

## Solution

Add two controls to a new filter bar above the table:

1. A `SearchInput` (the primitive added in Gap #2) bound to a `query` state that matches against estimate `#` and customer name.
2. Four filter chips — `All` / `No rooms` / `Measured` / `Quoted` — bound to a `status` state, with the derived semantics defined below.

Filtering is delegated to a pure `filterEstimates` helper (mirrors `filterCustomers` from Gap #2) so the rules are unit-testable in isolation.

## Components

### `components/estimates/filterEstimates.ts` (new)

Pure helper. Exists as its own module so it's unit-testable without rendering.

```ts
export type EstimateStatus = "all" | "empty" | "measured" | "quoted";

export type EstimateFilterInput = {
  id: number;
  customer?: { name: string } | null | undefined;
  items?: { type: string }[] | undefined;
  quotes?: unknown[] | undefined;
};

export function filterEstimates<T extends EstimateFilterInput>(
  estimates: T[],
  query: string,
  status: EstimateStatus
): T[];
```

**Behavior:**

1. **Status filter** (when `status !== "all"`):
   - `"empty"` — keep only estimates whose `items` contains zero entries with `type === "room"`.
   - `"measured"` — keep only estimates that have at least one `type === "room"` item **and** have an empty `quotes` array (or no `quotes` field).
   - `"quoted"` — keep only estimates that have at least one entry in `quotes`.
2. **Query filter** (when `query.trim()` is non-empty):
   - Trim and lowercase the query once.
   - Strip a leading `#` so `#7` and `7` both match estimate id 7.
   - Match if `String(estimate.id)` contains the (cleaned) query, OR `customer.name` (case-insensitive substring) does.
3. Both filters compose; either may be a no-op.

No fuzzy matching, no whitespace tokenization. The list is small and client-side; substring + status flags are sufficient.

The `EstimateFilterInput` shape is intentionally narrow so the generic constraint accepts the full `Estimate` type from `lib/hooks/useEstimates.ts` (which has many additional fields) without widening.

### `components/estimates/EstimateList.tsx` (modified)

Three changes:

- Add `query` and `status` state alongside the existing `isLoading` data.
- Insert a filter bar (between the header and the table) that renders:
  - `<SearchInput>` first (matches `screen-estlist` markup order),
  - the four chip buttons,
  - a hidden-count `<span>` (`{filtered.length} shown`) shown only when narrowing.
- Use `filterEstimates(estimates, query, status)` to drive the rendered rows.
- Branch the empty-state copy: when any narrowing is active and the result is empty, render `No estimates match.` (with the query quoted if present); otherwise keep the existing `No estimates yet.` copy.

The chip styling reuses the exact pattern from `CustomerList.tsx` so the two list screens stay visually consistent.

## State and persistence

Local React state only. Not URL-synced. Matches the customers-search precedent and the design (no router work in the prototype).

## Tests

New file: `__tests__/components/estimates/filterEstimates.test.ts`. Vitest-only; no React rendering needed. Cases:

1. Empty query and `status === "all"` returns the input unchanged.
2. `status === "empty"` keeps estimates with zero `type === "room"` items (and treats missing `items` as empty).
3. `status === "measured"` keeps estimates with at least one room and no quotes (treats missing `quotes` as empty).
4. `status === "quoted"` keeps estimates with at least one quote.
5. Query matches by stringified `id`.
6. Query matches `id` with a leading `#`.
7. Query matches by customer name case-insensitively.
8. Query and status compose (both must hold).
9. Query is trimmed before matching.
10. Returns `[]` when nothing matches.

No new component tests. The vitest config is `environment: "node"` and there is no jsdom or testing-library installed (same constraint documented in the customers-search spec).

## Out of scope

- Debounce. The list is small and in-memory; instant filtering is fine.
- Keyboard shortcut (`/`) to focus the input.
- URL state for `query` or `status`.
- Fuzzy matching, tokenization, or scoring.
- Search highlighting in table rows.
- Searching across `address`, `phone`, `email`, or `date` (the design HTML's prototype searches these too, but the roadmap scope is narrower; can be revisited later if needed).
- Status filter persistence across navigation.

## Acceptance

- Typing in the search input filters the rendered table immediately.
- The four chips toggle between status states; clicking the active chip is a no-op (it stays selected).
- `#7` and `7` both match estimate id 7.
- Status `Quoted` returns only estimates whose `quotes` array is non-empty.
- Status `No rooms` returns only estimates whose `items` has no `type === "room"` entries.
- Status `Measured` excludes both estimates without rooms and estimates that already have quotes.
- "X shown" hidden-count appears whenever any filter is narrowing the list.
- Empty-state copy reflects whether a search/status is narrowing.
- `biome ci .` passes; `vitest` passes including the new `filterEstimates` tests.
