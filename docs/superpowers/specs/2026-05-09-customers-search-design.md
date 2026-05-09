# Customers list — search input

**Date:** 2026-05-09
**Roadmap parent:** [`2026-05-09-design-gap-roadmap-design.md`](./2026-05-09-design-gap-roadmap-design.md) — Tier 1, Gap #2
**Source design:** `design/SqFt - App.html` — `screen-customers` (HTML lines 575–604)

## Problem

The Customers list (`components/customers/CustomerList.tsx`) has source-filter chips but no text search. At >~20 customers, finding by name, phone, email, or address becomes unusable.

## Solution

Add a search input to the filter bar, left of the source chips. Match against `name`, `phone`, `email`, and `address` (case-insensitive substring, per field). Search composes with the existing source filter — both apply.

Extract the search input as a shared primitive at `components/ui/SearchInput.tsx` so Tier 1 gaps #1 (Quotes list) and #3 (Estimates list) can reuse it without duplication. The design HTML uses one `.search-wrap` pattern across all three list screens, which justifies the abstraction now.

## Components

### `components/ui/SearchInput.tsx` (new)

Controlled input matching the design HTML's `.search-wrap` / `.search-input` / `.search-clear` markup.

**Props:**

```ts
type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string; // applied to the wrapper for layout overrides
};
```

**Behavior:**

- Magnifier SVG icon, absolutely positioned at the left.
- `<input type="text">` with the supplied `value` and `placeholder`.
- Clear button (`×`) absolutely positioned on the right. Renders only when `value` is non-empty. Calls `onChange("")` on click.
- Styling uses existing CSS vars (`--surface`, `--ink`, `--muted`, `--line`, `--ink-2`) — same approach as `Button`/`SourceBadge`.
- Wrapper is `flex: 1` with `min-width: 200px` and `max-width: 320px` per the design.

### `components/customers/filterCustomers.ts` (new)

Pure helper. Exists as its own module so it's unit-testable without rendering.

```ts
export type CustomerFilterInput = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: string;
};

export function filterCustomers<T extends CustomerFilterInput>(
  customers: T[],
  query: string,
  source: string
): T[];
```

**Behavior:**

1. If `query.trim()` is non-empty: keep customers where any of `name`, `phone`, `email`, `address` (skipping null/undefined) contains the query case-insensitively. Trim and lowercase the query once before iterating.
2. If `source !== "all"`: keep customers where `customer.source === source`.
3. Both filters compose; either may be a no-op.

No fuzzy matching, no whitespace tokenization. The list is small and client-side; a substring filter is sufficient for the contractor-flow use case.

### `components/customers/CustomerList.tsx` (modified)

- Add `const [query, setQuery] = useState("")` alongside the existing `filter` state.
- Replace the inline `filtered` expression with `filterCustomers(customers, query, filter)`.
- Render `<SearchInput value={query} onChange={setQuery} placeholder="Search name, phone, email, address…" />` as the first child of the filter bar (left of the source chips).
- The existing "X shown" hidden-count line keeps working unchanged because it triggers on `filtered.length !== customers.length`.
- Empty-state copy: when `query.trim()` is non-empty and `filtered.length === 0`, render `No customers match "{query}".`; otherwise the existing `No customers found.`.

## State and persistence

Local React state only. Not URL-synced. Matches the existing source-chip pattern; matches the design (no router work in the prototype). Out of scope to add URL state for one filter when the other is local.

## Tests

New file: `__tests__/components/customers/filterCustomers.test.ts`. Vitest-only; no React rendering needed. Cases:

1. Empty query and `source === "all"` returns the input unchanged.
2. Query matches `name` (case-insensitive).
3. Query matches `phone`.
4. Query matches `email`.
5. Query matches `address`.
6. Query handles records where optional fields (`email`, `address`) are `null`.
7. Source-only filter keeps only matching `source` values.
8. Query and source compose (both must hold).
9. Query is trimmed before matching (`"  smith "` matches the same rows as `"smith"`).

No `SearchInput.test.tsx`. The project's vitest config is `environment: "node"` with no testing-library installed; adding component tests is out of scope for this gap.

## Out of scope

- Debounce. The list is in-memory and small; instant filtering is fine.
- Keyboard shortcut (`/` or `Cmd+K`) to focus the input.
- URL state for `query` or `filter`.
- Fuzzy matching, tokenization, or scoring.
- Search highlighting in table rows.
- Component tests for `SearchInput` (no jsdom/testing-library setup; would require introducing them).

## Acceptance

- Typing in the search input filters the rendered table immediately.
- Search and source chip compose: selecting `Phone` and typing `Smith` returns only `Smith`-matching customers whose source is `phone`.
- Clear button (`×`) appears only when input is non-empty and resets the input on click.
- "X shown" hidden-count appears whenever any filter is narrowing the list.
- Empty-state copy reflects whether a search query is active.
- `biome ci .` passes; `vitest` passes including the new `filterCustomers` tests.
