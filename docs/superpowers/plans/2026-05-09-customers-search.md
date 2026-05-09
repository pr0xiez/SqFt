# Customers Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a text-search input to the Customers list that filters by name, phone, email, and address, composing with the existing source-filter chips.

**Architecture:** Three-file change: a reusable `SearchInput` UI primitive (also unblocks roadmap gaps #1 and #3), a pure `filterCustomers` helper that's vitest-testable in isolation, and a wiring change to `CustomerList.tsx` that swaps its inline filter expression for the helper and renders the search input as the first child of the filter bar.

**Tech Stack:** React 19, Next.js (project's vendored fork — see `AGENTS.md`), TypeScript, Tailwind v4 with CSS variables (`--surface`, `--ink`, `--muted`, `--line`, `--ink-2`, `--surface-2`, `--bg`, `--font-mono`), Vitest (`environment: "node"`, no jsdom), Biome for lint.

**Spec:** `docs/superpowers/specs/2026-05-09-customers-search-design.md`

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `components/ui/SearchInput.tsx` | **Create** | Controlled search input primitive (icon + input + conditional clear button). Reused by gaps #1 and #3. |
| `components/customers/filterCustomers.ts` | **Create** | Pure helper that filters a `Customer[]` by query and source. Isolated for testability. |
| `__tests__/components/customers/filterCustomers.test.ts` | **Create** | Vitest tests for the pure helper. |
| `components/customers/CustomerList.tsx` | **Modify** | Add `query` state, render `SearchInput`, delegate filtering to `filterCustomers`, branch empty-state copy. |

---

## Task 1: Pure `filterCustomers` helper (TDD)

**Files:**
- Create: `components/customers/filterCustomers.ts`
- Test: `__tests__/components/customers/filterCustomers.test.ts`

This is the smallest, lowest-risk piece and has zero React surface area. We do it first via TDD so the filter semantics are pinned down before any UI code reads them.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/customers/filterCustomers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterCustomers } from "@/components/customers/filterCustomers";

type C = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: string;
};

const sample: C[] = [
  {
    id: 1,
    name: "Alice Smith",
    phone: "555-1111",
    email: "alice@example.com",
    address: "12 Oak St",
    source: "phone",
  },
  {
    id: 2,
    name: "Bob Jones",
    phone: "555-2222",
    email: "bob@example.com",
    address: "44 Elm Rd",
    source: "online",
  },
  {
    id: 3,
    name: "Carol Lee",
    phone: null,
    email: null,
    address: null,
    source: "referral",
  },
];

describe("filterCustomers", () => {
  it("returns input unchanged when query is empty and source is 'all'", () => {
    expect(filterCustomers(sample, "", "all")).toEqual(sample);
  });

  it("matches by name case-insensitively", () => {
    const result = filterCustomers(sample, "alice", "all");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("matches by phone substring", () => {
    const result = filterCustomers(sample, "2222", "all");
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("matches by email substring", () => {
    const result = filterCustomers(sample, "BOB@", "all");
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("matches by address substring", () => {
    const result = filterCustomers(sample, "elm", "all");
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("ignores null optional fields without throwing", () => {
    const result = filterCustomers(sample, "carol", "all");
    expect(result.map((c) => c.id)).toEqual([3]);
  });

  it("filters by source when query is empty", () => {
    const result = filterCustomers(sample, "", "phone");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("composes query and source (both must match)", () => {
    // "555" is in both Alice and Bob's phones, but only Alice is source 'phone'.
    const result = filterCustomers(sample, "555", "phone");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("trims whitespace from the query before matching", () => {
    const result = filterCustomers(sample, "   smith   ", "all");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterCustomers(sample, "zzz-no-match", "all")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/components/customers/filterCustomers.test.ts`

Expected: all tests fail with a module-resolution error along the lines of `Failed to resolve import "@/components/customers/filterCustomers"`.

- [ ] **Step 3: Write the minimal implementation**

Create `components/customers/filterCustomers.ts`:

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
): T[] {
  const q = query.trim().toLowerCase();
  return customers.filter((c) => {
    if (q.length > 0) {
      const fields: (string | null)[] = [c.name, c.phone, c.email, c.address];
      const hit = fields.some(
        (f) => typeof f === "string" && f.toLowerCase().includes(q)
      );
      if (!hit) return false;
    }
    if (source !== "all" && c.source !== source) return false;
    return true;
  });
}
```

Note the generic constraint: callers can pass the full `Customer` type from `lib/hooks/useCustomers.ts` (which has additional fields like `id`, `createdAt`, `_count`) and get the same shape back — no widening.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/components/customers/filterCustomers.test.ts`

Expected: all 10 tests pass.

- [ ] **Step 5: Run lint**

Run: `npx biome ci components/customers/filterCustomers.ts __tests__/components/customers/filterCustomers.test.ts`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/customers/filterCustomers.ts __tests__/components/customers/filterCustomers.test.ts
git commit -m "feat(customers): add filterCustomers helper for query+source filtering"
```

---

## Task 2: `SearchInput` UI primitive

**Files:**
- Create: `components/ui/SearchInput.tsx`

A controlled input with magnifier icon and conditional clear button. Styled to match the design HTML's `.search-wrap` / `.search-input` / `.search-clear` (see `design/SqFt - App.html` lines 118–125 for the source CSS and lines 587–591 for the markup we are reproducing).

No tests for this component — vitest is `environment: "node"` and there is no jsdom or testing-library installed in this project. The behavior is verified end-to-end by Task 3 (manual browser check) and the `filterCustomers` tests cover the data layer.

- [ ] **Step 1: Create the component**

Create `components/ui/SearchInput.tsx`:

```tsx
"use client";

import { cn } from "@/lib/cn";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: SearchInputProps) {
  return (
    <div
      className={cn(
        "relative flex-1 min-w-[200px] max-w-[320px] mr-1",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[13px] h-[13px] text-[var(--muted)] pointer-events-none"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full font-[var(--font-mono)] text-[12px]",
          "py-[7px] pr-7 pl-[30px]",
          "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]",
          "rounded-[6px] tracking-[.01em]",
          "transition-colors duration-150",
          "placeholder:text-[var(--muted)]",
          "focus:outline-none focus:border-[var(--ink-2)]"
        )}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2",
            "w-[18px] h-[18px] rounded-full",
            "border-none bg-[var(--surface-2)] text-[var(--muted)]",
            "text-[11px] leading-none cursor-pointer",
            "flex items-center justify-center",
            "hover:text-[var(--ink)] hover:bg-[var(--line)]"
          )}
        >
          ×
        </button>
      )}
    </div>
  );
}
```

The class strings track the design HTML rules 1:1: positions, sizes, paddings, colors. The clear button is conditionally rendered (rather than CSS-toggled with a `.show` class) because React handles conditional rendering more idiomatically than imperative class toggling.

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit`

Expected: no errors. (This catches typos in CSS-var class names? No — Tailwind arbitrary values are strings, not type-checked. But it does catch any prop-shape mismatches.)

- [ ] **Step 3: Run lint**

Run: `npx biome ci components/ui/SearchInput.tsx`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/SearchInput.tsx
git commit -m "feat(ui): add SearchInput primitive for list filter bars"
```

---

## Task 3: Wire `SearchInput` and `filterCustomers` into `CustomerList`

**Files:**
- Modify: `components/customers/CustomerList.tsx`

Three changes:
1. Add `query` state.
2. Replace the inline `filtered` expression with a call to `filterCustomers`.
3. Render `<SearchInput>` as the first child of the filter bar (before the source chips).
4. Branch the empty-state copy on whether a search query is active.

- [ ] **Step 1: Add the imports**

In `components/customers/CustomerList.tsx`, add to the existing import block:

```tsx
import { SearchInput } from "@/components/ui/SearchInput";
import { filterCustomers } from "@/components/customers/filterCustomers";
```

The existing `useState`, `useRouter`, etc. imports stay.

- [ ] **Step 2: Add the `query` state and replace the `filtered` expression**

Inside `CustomerListView`, the current state and filter block looks like this (lines ~32–36):

```tsx
const { data: customers = [], isLoading } = useCustomers();
const [filter, setFilter] = useState<string>("all");
const [panelOpen, setPanelOpen] = useState(false);

const filtered =
  filter === "all" ? customers : customers.filter((c) => c.source === filter);
```

Replace it with:

```tsx
const { data: customers = [], isLoading } = useCustomers();
const [filter, setFilter] = useState<string>("all");
const [query, setQuery] = useState<string>("");
const [panelOpen, setPanelOpen] = useState(false);

const filtered = filterCustomers(customers, query, filter);
```

`filterCustomers` accepts a `Customer[]` because `Customer` from `lib/hooks/useCustomers.ts` has all the fields the helper's `CustomerFilterInput` constraint requires (`name`, `phone`, `email`, `address`, `source`). The optional fields are typed `string | null | undefined` on `Customer` — pass-through works because the helper's `typeof f === "string"` guard handles `undefined` the same as `null`.

- [ ] **Step 3: Render the `SearchInput` in the filter bar**

The current filter bar (lines ~58–80) is a single `<div>` containing the source-chip buttons and the "X shown" count. Find this block:

```tsx
{/* Filter bar */}
<div className="flex flex-wrap items-center gap-2 mb-4">
  {SOURCES.map((src) => (
    <button
```

Insert the search input as the first child, **before** the `{SOURCES.map(...)}`:

```tsx
{/* Filter bar */}
<div className="flex flex-wrap items-center gap-2 mb-4">
  <SearchInput
    value={query}
    onChange={setQuery}
    placeholder="Search name, phone, email, address…"
  />
  {SOURCES.map((src) => (
    <button
```

The rest of the filter bar (source chips and the `{filtered.length !== customers.length && ...}` count) is unchanged. The hidden-count condition keeps working: it now triggers when *either* the search or the source chip is narrowing the list.

- [ ] **Step 4: Branch the empty-state copy**

Find the empty-state block (lines ~105–108):

```tsx
) : filtered.length === 0 ? (
  <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
    No customers found.
  </div>
```

Replace with:

```tsx
) : filtered.length === 0 ? (
  <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
    {query.trim().length > 0
      ? `No customers match "${query.trim()}".`
      : "No customers found."}
  </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Run lint**

Run: `npx biome ci components/customers/CustomerList.tsx`

Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`

Expected: all tests pass, including the new `filterCustomers` tests.

- [ ] **Step 8: Manual browser check**

Per `AGENTS.md`'s "Doing tasks" guidance, verify UI changes in a browser before claiming done.

1. Start the dev server: `npm run dev`
2. Open the app, navigate to `/customers`.
3. **Golden path:**
   - Verify the search input appears at the start of the filter bar with the magnifier icon and the placeholder `Search name, phone, email, address…`.
   - Type a few letters of an existing customer's name — rows narrow as you type.
   - Type something matching only a phone number (e.g. last four digits) — that customer's row remains.
   - Type something matching only an address — that customer's row remains.
   - Click the `×` clear button — input clears, all rows return.
4. **Composition:**
   - With a query active, click a source chip (e.g. `Phone`). Both filters narrow the list together.
   - The "X shown" count appears whenever either filter is active.
5. **Empty state:**
   - Type something that matches nothing (e.g. `zzz`). Empty-state copy reads `No customers match "zzz".`
   - Clear the input. Original "X customers" header count is unchanged.
6. **Edge case:**
   - Verify nothing throws for customers without an email or address (the seed script should have at least one such customer; if not, this is verified by the unit test for null fields and is acceptable).

- [ ] **Step 9: Commit**

```bash
git add components/customers/CustomerList.tsx
git commit -m "feat(customers): add search input to list, composing with source filter"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run the full lint per `AGENTS.md`**

Run: `npx biome ci .`

Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`

Expected: all tests pass.

- [ ] **Step 3: `git status` should be clean**

Run: `git status`

Expected: `nothing to commit, working tree clean` and the branch ahead of `main` by 3 commits.

---

## Self-review notes

- Spec coverage: every spec section maps to a task — `SearchInput` (Task 2), `filterCustomers` helper (Task 1), `CustomerList` wiring + empty-state branch (Task 3), tests (Task 1), out-of-scope items left out by design.
- No placeholders; every code step contains the exact code.
- Type names are consistent: `CustomerFilterInput` is defined in Task 1 and not redefined elsewhere; `filterCustomers` keeps the same signature across tasks.
- One concession to the spec: spec says "Wrapper is `flex: 1` with `min-width: 200px` and `max-width: 320px`" — Task 2 implements this with Tailwind arbitrary values rather than a stylesheet, which matches the rest of the codebase (`Button.tsx`, `CustomerList.tsx` already use this pattern).
