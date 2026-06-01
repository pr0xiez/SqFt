# Server-Side List Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move search, filtering, sorting, and pagination for the estimates, customers, and site-measures list views from the client (which fetches the entire org dataset) to the server, using offset pagination.

**Architecture:** A small shared `lib/pagination` module defines the query-param contract and `{ items, total, facets }` response envelope. Each list repository becomes a paginated query: estimates stays in Prisma's query builder (with a new denormalized `Estimate.total` column for sort-by-total); site measures uses Prisma existence filters; customers uses a `$queryRaw` aggregate for page selection then hydrates rows via Prisma. React Query hooks switch from "fetch everything" to passing params; the existing `Pagination` ("tape-measure") UI is driven by a server-returned `total`.

**Tech Stack:** Next.js (App Router, custom `apiRoute` seam), Prisma + PostgreSQL (Neon), React Query (`@tanstack/react-query`), Vitest, Playwright, Biome.

**Reference spec:** `docs/superpowers/specs/2026-06-01-server-side-list-pagination-design.md`

---

## Conventions for every phase

- **Lint gate (per AGENTS.md + memory):** `biome ci .` must pass before any commit. Run it as the last check in each task's verification.
- **Tests:** `npx vitest run <path>` for a single file. Real-DB tests must be gated on `VITEST_DB_AVAILABLE` (per project memory) — none in this plan require a live DB; all repo tests mock `@/lib/prisma`.
- **E2E:** `npx playwright test --workers=1` locally (matches CI; avoids the parallel-flaky contention noted in memory).
- **Migrations (per memory):** add new migrations on top, never squash. The only schema change here is an additive nullable column — safe on the populated Neon PR branch (no `NOT NULL`, no 23502). Backfill runs as a **separate** script, never inside the `ADD COLUMN` migration (migrate deploy is non-atomic).
- **Commit** at the end of each task with the message shown.

---

## File structure

**New files:**
- `lib/pagination/constants.ts` — canonical `PER_PAGE_OPTIONS`, `DEFAULT_PER_PAGE`.
- `lib/pagination/types.ts` — `Paginated<T>` envelope type.
- `lib/pagination/params.ts` — `parsePageParams()` URL→params helper (shared by all routes).
- `__tests__/lib/pagination/params.test.ts` — unit tests for the parser.
- `scripts/backfillEstimateTotal.ts` — one-off backfill of `Estimate.total`.

**Modified files:**
- `prisma/schema.prisma` — add `Estimate.total`, add `@@index([orgId])` to Customer/Estimate/SiteMeasure.
- `prisma/migrations/<ts>_pagination/migration.sql` — generated.
- `prisma/seed.ts` — populate `Estimate.total`.
- `components/ui/Pagination.tsx` + `lib/hooks/useTableQueryState.ts` — import `PER_PAGE_OPTIONS` from the new constants module.
- `lib/repositories/estimateRepo.ts`, `customerRepo.ts`, `siteMeasureRepo.ts` — paginated list functions; estimate total recompute on write.
- `app/api/estimates/route.ts`, `app/api/customers/route.ts`, `app/api/site-measures/route.ts` — parse params, return envelope.
- `lib/hooks/useEstimates.ts`, `useCustomers.ts`, `useSiteMeasures.ts` — params-driven queries.
- `components/estimates/EstimateList.tsx`, `components/customers/CustomerList.tsx`, `components/siteMeasures/SiteMeasureList.tsx` — server-driven list state.
- Corresponding `__tests__` and `tests/e2e` files.

> **Verify the customers API route path first.** This plan assumes `app/api/customers/route.ts` and `app/api/site-measures/route.ts`. The 2026-05-29 remodel renamed `app/api/estimates/` → `app/api/site-measures/` and `app/api/quotes/` → `app/api/estimates/`. Confirm the actual paths with `Glob app/api/**/route.ts` before editing in Phases 2–3.

---

# Phase 0 — Shared pagination contract

### Task 0.1: Pagination constants module

**Files:**
- Create: `lib/pagination/constants.ts`
- Modify: `components/ui/Pagination.tsx:18` (re-export instead of declare)
- Modify: `lib/hooks/useTableQueryState.ts:6` (import path)

- [ ] **Step 1: Create the constants module**

```ts
// lib/pagination/constants.ts

/** Allowed "rows per page" choices, shared by the server param parser and the
 *  client Pagination control so they can never drift. */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;

export const DEFAULT_PER_PAGE = 25;

export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];
```

- [ ] **Step 2: Re-export from Pagination.tsx**

In `components/ui/Pagination.tsx`, replace the local declaration:

```ts
// REMOVE: export const PER_PAGE_OPTIONS = [25, 50, 100];
// ADD near the top imports:
import { PER_PAGE_OPTIONS } from "@/lib/pagination/constants";
// ADD to keep the existing public re-export working for current importers:
export { PER_PAGE_OPTIONS } from "@/lib/pagination/constants";
```

(`useTableQueryState.ts` imports `PER_PAGE_OPTIONS` from `@/components/ui/Pagination` today; that import keeps working via the re-export, so no change needed there unless you prefer to point it at the constants module directly.)

- [ ] **Step 3: Verify nothing broke**

Run: `npx tsc --noEmit` (or `npx biome ci .`)
Expected: no new errors; `PER_PAGE_OPTIONS` resolves from one source.

- [ ] **Step 4: Commit**

```bash
git add lib/pagination/constants.ts components/ui/Pagination.tsx
git commit -m "refactor: extract PER_PAGE_OPTIONS to lib/pagination/constants"
```

---

### Task 0.2: Response envelope type

**Files:**
- Create: `lib/pagination/types.ts`

- [ ] **Step 1: Create the type module**

```ts
// lib/pagination/types.ts

/**
 * Standard paginated list response.
 * - `items`: the rows for the requested page (already sliced server-side).
 * - `total`: count of rows matching the active filters (drives pageCount).
 * - `facets`: counts for the filter pills, keyed by pill value.
 */
export type Paginated<T> = {
  items: T[];
  total: number;
  facets: Record<string, number>;
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/pagination/types.ts
git commit -m "feat: add Paginated response envelope type"
```

---

### Task 0.3: Query-param parser

**Files:**
- Create: `lib/pagination/params.ts`
- Test: `__tests__/lib/pagination/params.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/pagination/params.test.ts
import { describe, expect, it } from "vitest";
import { parsePageParams } from "@/lib/pagination/params";

const opts = {
  validSortKeys: ["date", "name"] as const,
  defaultSort: { key: "date" as const, direction: "desc" as const },
};

function parse(qs: string) {
  return parsePageParams(new URL(`http://x/api/list?${qs}`), opts);
}

describe("parsePageParams", () => {
  it("applies defaults when params are absent", () => {
    expect(parse("")).toEqual({
      page: 1,
      perPage: 25,
      sort: { key: "date", direction: "desc" },
      q: "",
    });
  });

  it("clamps page to >= 1 and floors fractions", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-4").page).toBe(1);
    expect(parse("page=3.9").page).toBe(3);
  });

  it("rejects perPage not in the allow-list, falling back to default", () => {
    expect(parse("perPage=999").perPage).toBe(25);
    expect(parse("perPage=50").perPage).toBe(50);
  });

  it("ignores an invalid sort key or direction, keeping the default", () => {
    expect(parse("sort=bogus&dir=asc").sort).toEqual({
      key: "date",
      direction: "desc",
    });
    expect(parse("sort=name&dir=sideways").sort).toEqual({
      key: "date",
      direction: "desc",
    });
  });

  it("accepts a valid sort key + direction", () => {
    expect(parse("sort=name&dir=asc").sort).toEqual({
      key: "name",
      direction: "asc",
    });
  });

  it("trims the search query", () => {
    expect(parse("q=%20%20acme%20").q).toBe("acme");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/lib/pagination/params.test.ts`
Expected: FAIL — `parsePageParams` is not defined.

- [ ] **Step 3: Implement the parser**

```ts
// lib/pagination/params.ts
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from "@/lib/pagination/constants";
import type { SortDirection, SortState } from "@/lib/sort";

type ParseOpts<K extends string> = {
  validSortKeys: readonly K[];
  defaultSort: SortState<K>;
};

export type PageParams<K extends string> = {
  page: number;
  perPage: number;
  sort: SortState<K>;
  q: string;
};

const isDir = (v: string | null): v is SortDirection =>
  v === "asc" || v === "desc";

export function parsePageParams<K extends string>(
  url: URL,
  opts: ParseOpts<K>
): PageParams<K> {
  const sp = url.searchParams;

  const rawPage = Number(sp.get("page"));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawPerPage = Number(sp.get("perPage"));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(rawPerPage)
    ? rawPerPage
    : DEFAULT_PER_PAGE;

  const sortKey = sp.get("sort");
  const dir = sp.get("dir");
  const sort: SortState<K> =
    sortKey && opts.validSortKeys.includes(sortKey as K) && isDir(dir)
      ? { key: sortKey as K, direction: dir }
      : opts.defaultSort;

  const q = (sp.get("q") ?? "").trim();

  return { page, perPage, sort, q };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run __tests__/lib/pagination/params.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add lib/pagination/params.ts __tests__/lib/pagination/params.test.ts
git commit -m "feat: add parsePageParams query-param helper"
```

---

# Phase 1 — Estimates (tracer)

Establishes the end-to-end contract. Introduces the `Estimate.total` denormalization.

### Task 1.1: Add `Estimate.total` column + indexes (schema & migration)

**Files:**
- Modify: `prisma/schema.prisma` (Estimate model; Customer/Estimate/SiteMeasure indexes)
- Create: `prisma/migrations/<timestamp>_pagination/migration.sql` (generated)

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, add to the `Estimate` model (after `createdAt`):

```prisma
  /// Denormalized cache of computeEstimateView().total. Null when the estimate
  /// has no line items. Maintained in create/save/revise; backfilled by
  /// scripts/backfillEstimateTotal.ts. Sorting the list by total reads this.
  total         Float?
```

Add indexes (the paginated `where: { orgId } ORDER BY` would otherwise scan):

```prisma
// Estimate model:
  @@index([orgId])
// Customer model:
  @@index([orgId])
// SiteMeasure model:
  @@index([orgId])
```

- [ ] **Step 2: Generate the migration (additive, no backfill inside it)**

Run: `npx prisma migrate dev --name pagination`
Expected: creates `prisma/migrations/<ts>_pagination/migration.sql` containing `ALTER TABLE "Estimate" ADD COLUMN "total" DOUBLE PRECISION;` (nullable — no default, no NOT NULL) plus the three `CREATE INDEX` statements. The Prisma client regenerates.

- [ ] **Step 3: Confirm migration safety**

Open the generated `migration.sql`. Verify:
- `ADD COLUMN "total"` has **no** `NOT NULL` and **no** `DEFAULT` → safe on populated Neon PR branch.
- No `UPDATE`/backfill statements in the file (backfill is a separate script).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Estimate.total column and orgId indexes"
```

---

### Task 1.2: Recompute `Estimate.total` on write

**Files:**
- Modify: `lib/repositories/estimateRepo.ts` (`saveEstimate`, `createEstimate`, `reviseEstimate`)
- Test: `__tests__/repositories/estimateRepo.test.ts`

The formula lives in `computeEstimateView(fromPrismaEstimate(...))` (`lib/estimateView`). `total` is `null` when there are no line items, else `view.total`. Note `createEstimate` makes an empty estimate → `total` stays null (no work needed beyond the default). `saveEstimate` and `reviseEstimate` must recompute.

- [ ] **Step 1: Write the failing test (saveEstimate sets total)**

Add to `__tests__/repositories/estimateRepo.test.ts`. The existing `txMock.estimate` needs an `update` mock and the final `findFirst` must return line items + siteMeasure.items so the view can compute. Extend the mock object:

```ts
// At top with the other tx fns:
const estimateUpdate = vi.fn();
// In txMock.estimate, add:
//   update: estimateUpdate,
```

Then the test:

```ts
describe("saveEstimate — total denormalization", () => {
  it("recomputes and stores total from line items after save", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    // Final hydrate the repo reads to compute the view:
    estimateFindFirst.mockResolvedValue({
      id: 1,
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0.3,
      lineItems: [
        {
          id: 1,
          name: "Tile",
          rate: 10,
          qtyMode: "manual",
          qty: 5,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
      siteMeasure: { items: [] },
    });

    await saveEstimate(1, "org1", { markupPct: 0 });

    // 10 * 5 = 50, no markup, no fee → total 50
    expect(estimateUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { total: 50 },
    });
  });

  it("stores null total when the estimate has no line items", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({
      id: 1,
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0.3,
      lineItems: [],
      siteMeasure: { items: [] },
    });

    await saveEstimate(1, "org1", { markupPct: 0 });

    expect(estimateUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { total: null },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/repositories/estimateRepo.test.ts -t "total denormalization"`
Expected: FAIL — `estimateUpdate` never called / not a function.

- [ ] **Step 3: Implement the recompute helper + wire it in**

In `lib/repositories/estimateRepo.ts`, add the import and a helper:

```ts
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";

/** Recompute and persist Estimate.total inside an open transaction.
 *  `hydrated` must include lineItems and siteMeasure.items. Returns the
 *  computed total (null when there are no line items). */
async function syncEstimateTotal(
  tx: Prisma.TransactionClient,
  estimateId: number,
  hydrated: {
    markupPct: number;
    convenienceFeeRate: number;
    depositPct: number;
    lineItems: Parameters<typeof fromPrismaEstimate>[0]["lineItems"];
    siteMeasure: { items: Parameters<typeof fromPrismaEstimate>[0]["siteMeasure"]["items"] };
  }
): Promise<number | null> {
  const total =
    hydrated.lineItems.length === 0
      ? null
      : computeEstimateView(fromPrismaEstimate(hydrated)).total;
  await tx.estimate.update({ where: { id: estimateId }, data: { total } });
  return total;
}
```

In `saveEstimate`, the function already ends with a `tx.estimate.findFirst({ ... include: { lineItems, siteMeasure: { include: { items } }, ... } })`. Capture it, sync the total, and reflect it on the returned object:

```ts
    const result = await tx.estimate.findFirst({
      where: { id, orgId },
      include: { /* ...unchanged include... */ },
    });
    if (!result) return null;
    const total = await syncEstimateTotal(tx, id, result);
    return { ...result, total };
```

In `reviseEstimate`, after the `tx.lineItem.createMany(...)` block (and before returning `{ id: created.id }`), hydrate and sync:

```ts
    const hydrated = await tx.estimate.findFirst({
      where: { id: created.id },
      include: {
        lineItems: true,
        siteMeasure: { select: { items: true } },
      },
    });
    if (hydrated) await syncEstimateTotal(tx, created.id, hydrated);
```

(`createEstimate` needs no change — a new estimate has no line items, so the column default `null` is already correct.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/repositories/estimateRepo.test.ts`
Expected: PASS (existing tests + 2 new). If existing `saveEstimate` tests fail because `estimateFindFirst` now returns shapes lacking `lineItems`, update those stubs to include `lineItems: [], siteMeasure: { items: [] }`.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add lib/repositories/estimateRepo.ts __tests__/repositories/estimateRepo.test.ts
git commit -m "feat: maintain denormalized Estimate.total on save/revise"
```

---

### Task 1.3: Backfill script for existing estimates

**Files:**
- Create: `scripts/backfillEstimateTotal.ts`
- Modify: `package.json` (add script entry)

The formula includes linked-area geometry, so a pure-SQL `UPDATE` can't compute it — this must run the TS formula per estimate. Runs once, manually, after the migration deploys.

- [ ] **Step 1: Write the script**

```ts
// scripts/backfillEstimateTotal.ts
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { prisma } from "@/lib/prisma";

async function main() {
  const estimates = await prisma.estimate.findMany({
    select: {
      id: true,
      markupPct: true,
      convenienceFeeRate: true,
      depositPct: true,
      lineItems: true,
      siteMeasure: { select: { items: true } },
    },
  });

  let updated = 0;
  for (const e of estimates) {
    const total =
      e.lineItems.length === 0
        ? null
        : computeEstimateView(fromPrismaEstimate(e)).total;
    await prisma.estimate.update({ where: { id: e.id }, data: { total } });
    updated++;
  }
  console.log(`Backfilled total on ${updated} estimates`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the package.json script**

In `package.json` `"scripts"`, add (match the project's existing TS runner — check how `prisma/seed.ts` is invoked; it likely uses `tsx`):

```json
    "backfill:estimate-total": "tsx scripts/backfillEstimateTotal.ts"
```

- [ ] **Step 3: Smoke-run locally against the dev DB**

Run: `npm run backfill:estimate-total`
Expected: prints `Backfilled total on N estimates`; no errors. (Idempotent — safe to re-run.)

- [ ] **Step 4: Commit**

```bash
git add scripts/backfillEstimateTotal.ts package.json
git commit -m "feat: add one-off Estimate.total backfill script"
```

> **Deploy note:** after `prisma migrate deploy` adds the column, run `npm run backfill:estimate-total` once against each environment. Until it runs, `total` is null for pre-existing rows (they sort last and render as "—").

---

### Task 1.4: Update seed for `Estimate.total`

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Set total when seeding estimates**

In `prisma/seed.ts`, wherever estimates are created with line items, compute and set `total` using the same helper pattern (import `computeEstimateView`, `fromPrismaEstimate`). For seed estimates created without line items, set `total: null`. For estimates created with known line items, set `total` to the computed value (or run the formula inline). Keep it simple: after creating an estimate and its line items, do one `prisma.estimate.update({ where: { id }, data: { total } })` mirroring `syncEstimateTotal`.

- [ ] **Step 2: Run the seed**

Run: `npx prisma db seed`
Expected: completes without error; spot-check a seeded estimate has a non-null `total`.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore: populate Estimate.total in seed"
```

---

### Task 1.5: Paginated `listEstimates` repository

**Files:**
- Modify: `lib/repositories/estimateRepo.ts`
- Test: `__tests__/repositories/estimateRepo.test.ts`

New contract: `listEstimates(orgId, params)` returns `Paginated<EstimateWithSiteMeasureSummary>`.

**Sort key → Prisma orderBy map:**
| key | orderBy |
|-----|---------|
| `number` | `{ estimateNumber: dir }` |
| `status` | `{ status: dir }` |
| `date` | `{ date: dir }` |
| `total` | `{ total: dir }` |
| `customer` | `{ siteMeasure: { location: { customer: { name: dir } } } }` |
| `siteMeasure` | `{ siteMeasure: { siteMeasureNumber: dir } }` |

**Search semantics (documented change):** `estimateNumber`/`siteMeasureNumber` are `Int`, so SQL substring search is not available in the query builder. Server search matches **customer name** via case-insensitive `contains`, plus — when `q` (with a leading `#` stripped) is fully numeric — an exact `estimateNumber` match. The old client behavior of substring-matching number digits is intentionally dropped.

**Facets:** absolute counts by status via `groupBy` (ignores `q`/`status`, matching current `statusCounts` behavior).

- [ ] **Step 1: Write the failing tests** (replace the old `describe("listEstimates")`)

```ts
describe("listEstimates (paginated)", () => {
  const baseParams = {
    page: 1,
    perPage: 25,
    sort: { key: "date" as const, direction: "desc" as const },
    q: "",
    status: "all" as const,
  };

  function mockGroupBy() {
    // prisma.estimate.groupBy used for facets
    (estimateGroupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "draft", _count: { _all: 2 } },
      { status: "approved", _count: { _all: 3 } },
    ]);
  }

  it("scopes by org, applies skip/take and orderBy, returns items+total+facets", async () => {
    estimateFindMany.mockResolvedValue([{ id: 1 }]);
    estimateCount.mockResolvedValue(7);
    mockGroupBy();

    const res = await listEstimates("org1", { ...baseParams, page: 2, perPage: 25 });

    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { date: "desc" },
        skip: 25,
        take: 25,
      })
    );
    expect(res.total).toBe(7);
    expect(res.items).toEqual([{ id: 1 }]);
    expect(res.facets).toEqual({ all: 5, draft: 2, sent: 0, approved: 3, declined: 0 });
  });

  it("filters by status when not 'all'", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", { ...baseParams, status: "approved" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1", status: "approved" } })
    );
  });

  it("maps the customer sort key to the nested relation orderBy", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", {
      ...baseParams,
      sort: { key: "customer", direction: "asc" },
    });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { siteMeasure: { location: { customer: { name: "asc" } } } },
      })
    );
  });

  it("searches customer name (contains) and exact estimate number for numeric q", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", { ...baseParams, q: "#5001" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org1",
          OR: [
            { siteMeasure: { location: { customer: { name: { contains: "5001", mode: "insensitive" } } } } },
            { estimateNumber: 5001 },
          ],
        }),
      })
    );
  });
});
```

Add the `estimateGroupBy` mock fn at the top and into the `prisma.estimate` mock:

```ts
const estimateGroupBy = vi.fn();
// in vi.mock prisma.estimate: add `groupBy: estimateGroupBy,`
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/repositories/estimateRepo.test.ts -t "listEstimates (paginated)"`
Expected: FAIL — signature/return mismatch.

- [ ] **Step 3: Implement the paginated repo function**

Replace the existing `listEstimates` in `lib/repositories/estimateRepo.ts`:

```ts
import type { EstimateStatusFilter } from "@/components/estimates/filterEstimates";
import type { SortDirection } from "@/lib/sort";
import type { Paginated } from "@/lib/pagination/types";

export type EstimateSortKey =
  | "number"
  | "customer"
  | "siteMeasure"
  | "total"
  | "status"
  | "date";

export interface ListEstimatesParams {
  page: number;
  perPage: number;
  sort: { key: EstimateSortKey; direction: SortDirection };
  q: string;
  status: EstimateStatusFilter;
}

const ESTIMATE_LIST_INCLUDE = {
  siteMeasure: {
    select: {
      id: true,
      siteMeasureNumber: true,
      title: true,
      location: {
        select: {
          id: true,
          address: true,
          customer: { select: { id: true, name: true } },
        },
      },
      items: { orderBy: { sortOrder: "asc" } },
    },
  },
  lineItems: { orderBy: { sortOrder: "asc" } },
  _count: { select: { lineItems: true } },
} satisfies Prisma.EstimateInclude;

function estimateOrderBy(
  sort: ListEstimatesParams["sort"]
): Prisma.EstimateOrderByWithRelationInput {
  const dir = sort.direction;
  switch (sort.key) {
    case "number":
      return { estimateNumber: dir };
    case "status":
      return { status: dir };
    case "total":
      return { total: dir };
    case "customer":
      return { siteMeasure: { location: { customer: { name: dir } } } };
    case "siteMeasure":
      return { siteMeasure: { siteMeasureNumber: dir } };
    default:
      return { date: dir };
  }
}

function estimateSearchWhere(q: string): Prisma.EstimateWhereInput | null {
  const cleaned = q.trim().replace(/^#/, "");
  if (cleaned.length === 0) return null;
  const or: Prisma.EstimateWhereInput[] = [
    {
      siteMeasure: {
        location: {
          customer: { name: { contains: cleaned, mode: "insensitive" } },
        },
      },
    },
  ];
  if (/^\d+$/.test(cleaned)) or.push({ estimateNumber: Number(cleaned) });
  return { OR: or };
}

const ESTIMATE_STATUSES = ["draft", "sent", "approved", "declined"] as const;

export async function listEstimates(
  orgId: string,
  params: ListEstimatesParams
): Promise<Paginated<EstimateWithSiteMeasureSummary>> {
  const where: Prisma.EstimateWhereInput = { orgId };
  if (params.status !== "all") where.status = params.status;
  const search = estimateSearchWhere(params.q);
  if (search) Object.assign(where, search);

  const [items, total, grouped] = await prisma.$transaction([
    prisma.estimate.findMany({
      where,
      orderBy: estimateOrderBy(params.sort),
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: ESTIMATE_LIST_INCLUDE,
    }),
    prisma.estimate.count({ where }),
    prisma.estimate.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { _all: true },
    }),
  ]);

  const facets: Record<string, number> = { all: 0 };
  for (const s of ESTIMATE_STATUSES) facets[s] = 0;
  for (const row of grouped) {
    const n = row._count._all;
    facets.all += n;
    if (row.status in facets) facets[row.status] = n;
  }

  return { items, total, facets };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/repositories/estimateRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add lib/repositories/estimateRepo.ts __tests__/repositories/estimateRepo.test.ts
git commit -m "feat: paginate listEstimates (server-side filter/sort/facets)"
```

---

### Task 1.6: Estimates API route returns the envelope

**Files:**
- Modify: `app/api/estimates/route.ts`
- Test: `__tests__/api/estimates.test.ts` (create if absent; model on `__tests__/api/users.test.ts`)

The route parses params, calls the repo, and maps each item to the existing wire shape — but `total` now comes from the column (`estimate.total`), not `computeEstimateView`. The envelope is `{ items, total, facets }`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/estimates.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/repositories", () => ({
  listEstimates: vi.fn(),
  createEstimate: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET } from "@/app/api/estimates/route";
import { auth } from "@/lib/auth";
import { listEstimates } from "@/lib/repositories";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockList = vi.mocked(listEstimates);
const noParams = { params: Promise.resolve({}) };

function req(qs = "") {
  const url = `http://localhost/api/estimates${qs ? `?${qs}` : ""}`;
  const r = new Request(url, { method: "GET" });
  Object.defineProperty(r, "nextUrl", { value: new URL(url), writable: false });
  // biome-ignore lint/suspicious/noExplicitAny: duck-typing NextRequest
  return r as any as NextRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/estimates", () => {
  it("401 for crew (minRole lead)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: stub
    mockAuth.mockResolvedValue({ user: { id: "u", orgId: "org1", role: "crew" } } as any);
    expect((await GET(req(), noParams)).status).toBe(401);
  });

  it("passes parsed params to the repo and returns the envelope with column total", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: stub
    mockAuth.mockResolvedValue({ user: { id: "u", orgId: "org1", role: "lead" } } as any);
    mockList.mockResolvedValue({
      items: [
        // biome-ignore lint/suspicious/noExplicitAny: minimal row stub
        { id: 1, total: 123, _count: { lineItems: 2 }, lineItems: [], siteMeasure: { items: [], id: 9 } } as any,
      ],
      total: 1,
      facets: { all: 1, draft: 0, sent: 0, approved: 1, declined: 0 },
    });

    const res = await GET(req("page=2&perPage=50&status=approved&sort=total&dir=asc"), noParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.facets.approved).toBe(1);
    expect(body.items[0].total).toBe(123);
    expect(body.items[0].lineItems).toBeUndefined(); // stripped from list payload

    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 2,
        perPage: 50,
        status: "approved",
        sort: { key: "total", direction: "asc" },
      })
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/api/estimates.test.ts`
Expected: FAIL — route still returns a bare array.

- [ ] **Step 3: Rewrite the GET handler**

```ts
// app/api/estimates/route.ts
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateCreateSchema } from "@/lib/estimates/schema";
import { parsePageParams } from "@/lib/pagination/params";
import {
  createEstimate,
  type EstimateSortKey,
  listEstimates,
} from "@/lib/repositories";

const ESTIMATE_SORT_KEYS = [
  "number",
  "customer",
  "siteMeasure",
  "total",
  "status",
  "date",
] as const satisfies readonly EstimateSortKey[];

const ESTIMATE_STATUS_FILTERS = ["all", "draft", "sent", "approved", "declined"] as const;
type EstimateStatusFilterValue = (typeof ESTIMATE_STATUS_FILTERS)[number];

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: ESTIMATE_SORT_KEYS,
    defaultSort: { key: "date", direction: "desc" },
  });
  const statusParam = req.nextUrl.searchParams.get("status");
  const status: EstimateStatusFilterValue =
    statusParam && (ESTIMATE_STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as EstimateStatusFilterValue)
      : "all";

  const { items, total, facets } = await listEstimates(orgId, {
    page,
    perPage,
    sort,
    q,
    status,
  });

  return {
    items: items.map((estimate) => {
      const { lineItems: _lineItems, siteMeasure, total: rowTotal, ...rest } = estimate;
      const { items: _items, ...siteMeasureRest } = siteMeasure;
      return { ...rest, siteMeasure: siteMeasureRest, total: rowTotal };
    }),
    total,
    facets,
  };
});

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const estimate = await createEstimate(orgId, input);
    if (!estimate) throw new NotFoundError("Site measure not found");
    return estimate;
  }
);
```

> Note: `total` on the row replaces the old `_count.lineItems === 0 ? null : view.total` logic — the column is already null for empty estimates (Task 1.2), so the semantics match. `computeEstimateView`/`fromPrismaEstimate` imports are no longer needed in this route.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/api/estimates.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add app/api/estimates/route.ts __tests__/api/estimates.test.ts
git commit -m "feat: estimates GET returns paginated envelope"
```

---

### Task 1.7: `useEstimates` consumes params

**Files:**
- Modify: `lib/hooks/useEstimates.ts`
- Test: (covered by the component-level E2E in Task 1.9; no unit test for the hook)

- [ ] **Step 1: Define the params type, response type, and query**

```ts
// lib/hooks/useEstimates.ts — replace fetchEstimates + useEstimates
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SortDirection } from "@/lib/sort";

export interface EstimateListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  status: string;
}

export interface EstimateListResponse {
  items: EstimateListItem[];
  total: number;
  facets: Record<string, number>;
}

function estimatesQueryString(p: EstimateListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.status && p.status !== "all") sp.set("status", p.status);
  return sp.toString();
}

async function fetchEstimates(
  p: EstimateListParams
): Promise<EstimateListResponse> {
  const res = await fetch(`/api/estimates?${estimatesQueryString(p)}`);
  if (!res.ok) throw new Error("Failed to fetch estimates");
  return res.json();
}

export function useEstimates(params: EstimateListParams) {
  return useQuery({
    queryKey: ["estimates", params],
    queryFn: () => fetchEstimates(params),
    placeholderData: keepPreviousData,
  });
}
```

(The mutation hooks `useCreateEstimate`/`useUpdateEstimate`/etc. and their `invalidateQueries({ queryKey: ["estimates"] })` calls are unchanged — the `["estimates", params]` key still matches the `["estimates"]` prefix for invalidation.)

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: `EstimateListView` will now error (it calls `useEstimates()` with no args) — that's fixed in the next task. No other call sites.

- [ ] **Step 3: Commit** (after Task 1.8 compiles, commit together — or commit now and accept the transient type error noted)

```bash
git add lib/hooks/useEstimates.ts
git commit -m "feat: useEstimates takes server-side pagination params"
```

---

### Task 1.8: `EstimateListView` drives server pagination

**Files:**
- Modify: `components/estimates/EstimateList.tsx`

Remove client-side `filterEstimates`/`sortBy`/`paginate`/`statusCounts`. Add a debounced search term. Feed `useTableQueryState` + filters into `useEstimates`. Read `total`/`facets`/`items` from the response.

- [ ] **Step 1: Add a debounce helper** (if none exists in the repo, create `lib/hooks/useDebouncedValue.ts`)

```ts
// lib/hooks/useDebouncedValue.ts
"use client";
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 2: Rewrite the data wiring in `EstimateListView`**

Replace the data-derivation block (the `useEstimates()` call through `const { slice, safePage, total } = paginate(...)`) with:

```tsx
  const debouncedQuery = useDebouncedValue(query, 300);

  const sortKey = sort?.key ?? "date";
  const sortDir = sort?.direction ?? "desc";

  const { data, isLoading } = useEstimates({
    page,
    perPage,
    sort: sortKey,
    dir: sortDir,
    q: debouncedQuery,
    status,
  });

  const estimates = data?.items ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? {};
  const statusCounts = {
    all: facets.all ?? 0,
    draft: facets.draft ?? 0,
    sent: facets.sent ?? 0,
    approved: facets.approved ?? 0,
    declined: facets.declined ?? 0,
  } as Record<EstimateStatusFilter, number>;
```

- Delete the `filterEstimates`, `sortBy`, and `paginate` imports and their `useMemo` blocks.
- The rows now map over `estimates` (the page) directly instead of `slice`.
- `Pagination` receives `total` (from response), `page` (use `page`, since the server already clamped — pass `page` directly; the component still clamps defensively), `perPage`, `onPageChange={setPage}`, `onPerPageChange={setPerPage}`.
- Header count "{estimates.length} estimates" → "{total} estimates" (it was the full count before; `total` is now the filtered count — acceptable and more accurate; if you want the unfiltered org count, that's `facets.all`). Use `facets.all` to preserve "total estimates in org" semantics in the header, and `total` for the paginator.
- The `isNarrowed` / "{filtered.length} of {estimates.length}" readout: replace with `total !== (facets.all ?? 0)` and show `{total} of {facets.all}`.
- Empty states: `isLoading` → loading; `facets.all === 0` → "No estimates yet."; else `total === 0` → `<EmptyState noun="estimate" query={query} />`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `EstimateList.tsx`.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Use the `run` skill or `npm run dev`; load `/estimates`, page/sort/filter/search and confirm network requests carry the params and the list updates.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add components/estimates/EstimateList.tsx lib/hooks/useDebouncedValue.ts
git commit -m "feat: EstimateListView drives server-side pagination"
```

---

### Task 1.9: Update estimates E2E

**Files:**
- Modify: the estimates list E2E spec (find via `Glob tests/e2e/*.spec.ts` — likely `estimates.spec.ts` or `quotes.spec.ts`)

- [ ] **Step 1: Update assertions for server-driven paging**

- Assert the list request hits `/api/estimates?...` with `page`/`perPage` params.
- Assert changing the page issues a new request and swaps rows.
- Assert a status pill filters server-side (request carries `status=`, rows reduce, pill count from `facets`).
- Assert search issues a debounced request carrying `q=`.

- [ ] **Step 2: Run E2E (single worker)**

Run: `npx playwright test --workers=1 <spec>`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/<spec>
git commit -m "test: estimates E2E for server-side pagination"
```

---

### Task 1.10: Phase 1 full verification

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 2: Lint**

Run: `npx biome ci .`
Expected: no errors.

- [ ] **Step 3: E2E (single worker)**

Run: `npx playwright test --workers=1`
Expected: PASS.

The contract (params, envelope, hook pattern, denormalization) is now proven. Phases 2 and 3 reuse `parsePageParams`, `Paginated<T>`, `useDebouncedValue`, and the `keepPreviousData` hook pattern.

---

# Phase 2 — Site measures

No denormalization, no raw SQL — status buckets are existence filters; sorts are native/relation.

### Task 2.1: Paginated `listSiteMeasures` repository

**Files:**
- Modify: `lib/repositories/siteMeasureRepo.ts`
- Test: `__tests__/repositories/siteMeasureRepo.test.ts`

**Status buckets (existence filters):**
| value | where |
|-------|-------|
| `all` | (none) |
| `empty` | `items: { none: { type: "room" } }` |
| `measured` | `items: { some: { type: "room" } }, estimates: { none: {} }` |
| `estimated` | `items: { some: { type: "room" } }, estimates: { some: {} }` |

**Sort key → orderBy:** `id → { id: dir }`, `date → { date: dir }`, `customer → { location: { customer: { name: dir } } }`.

**Search:** customer name `contains` (insensitive); plus exact `siteMeasureNumber` when `q` is numeric.

**Facets:** absolute counts for empty/measured/estimated via three `count()` calls + `all` via one more (matches current `statusCounts` over the full set).

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/repositories/siteMeasureRepo.test.ts — add a paginated describe
describe("listSiteMeasures (paginated)", () => {
  const base = {
    page: 1,
    perPage: 25,
    sort: { key: "date" as const, direction: "desc" as const },
    q: "",
    status: "all" as const,
  };

  it("scopes by org, applies skip/take, returns items+total+facets", async () => {
    siteMeasureFindMany.mockResolvedValue([{ id: 1 }]);
    // count is called 5x: total + 4 facet buckets. Use mockResolvedValueOnce in order:
    siteMeasureCount
      .mockResolvedValueOnce(9) // total (filtered)
      .mockResolvedValueOnce(9) // all
      .mockResolvedValueOnce(2) // empty
      .mockResolvedValueOnce(3) // measured
      .mockResolvedValueOnce(4); // estimated

    const res = await listSiteMeasures("org1", { ...base, page: 2 });

    expect(siteMeasureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { date: "desc" },
        skip: 25,
        take: 25,
      })
    );
    expect(res.total).toBe(9);
    expect(res.facets).toEqual({ all: 9, empty: 2, measured: 3, estimated: 4 });
  });

  it("applies the 'measured' existence filter", async () => {
    siteMeasureFindMany.mockResolvedValue([]);
    siteMeasureCount.mockResolvedValue(0);
    await listSiteMeasures("org1", { ...base, status: "measured" });
    expect(siteMeasureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          items: { some: { type: "room" } },
          estimates: { none: {} },
        },
      })
    );
  });
});
```

Add `siteMeasureCount` to the test's prisma mock (`siteMeasure: { findMany, count, ... }`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/repositories/siteMeasureRepo.test.ts -t "listSiteMeasures (paginated)"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/repositories/siteMeasureRepo.ts
import type { Paginated } from "@/lib/pagination/types";
import type { SortDirection } from "@/lib/sort";

export type SiteMeasureSortKey = "id" | "customer" | "date";
export type SiteMeasureStatusFilter = "all" | "empty" | "measured" | "estimated";

export interface ListSiteMeasuresParams {
  page: number;
  perPage: number;
  sort: { key: SiteMeasureSortKey; direction: SortDirection };
  q: string;
  status: SiteMeasureStatusFilter;
}

const SITE_MEASURE_LIST_INCLUDE = {
  location: {
    select: {
      id: true,
      address: true,
      label: true,
      customer: { select: { id: true, name: true } },
    },
  },
  _count: { select: { items: true, estimates: true } },
} satisfies Prisma.SiteMeasureInclude;

function siteMeasureStatusWhere(
  status: SiteMeasureStatusFilter
): Prisma.SiteMeasureWhereInput {
  switch (status) {
    case "empty":
      return { items: { none: { type: "room" } } };
    case "measured":
      return { items: { some: { type: "room" } }, estimates: { none: {} } };
    case "estimated":
      return { items: { some: { type: "room" } }, estimates: { some: {} } };
    default:
      return {};
  }
}

function siteMeasureOrderBy(
  sort: ListSiteMeasuresParams["sort"]
): Prisma.SiteMeasureOrderByWithRelationInput {
  const dir = sort.direction;
  if (sort.key === "id") return { id: dir };
  if (sort.key === "customer")
    return { location: { customer: { name: dir } } };
  return { date: dir };
}

function siteMeasureSearchWhere(q: string): Prisma.SiteMeasureWhereInput | null {
  const cleaned = q.trim().replace(/^#/, "");
  if (cleaned.length === 0) return null;
  const or: Prisma.SiteMeasureWhereInput[] = [
    { location: { customer: { name: { contains: cleaned, mode: "insensitive" } } } },
  ];
  if (/^\d+$/.test(cleaned)) or.push({ siteMeasureNumber: Number(cleaned) });
  return { OR: or };
}

export async function listSiteMeasures(
  orgId: string,
  params: ListSiteMeasuresParams
): Promise<Paginated<SiteMeasureWithCustomerAndCount>> {
  const where: Prisma.SiteMeasureWhereInput = {
    orgId,
    ...siteMeasureStatusWhere(params.status),
  };
  const search = siteMeasureSearchWhere(params.q);
  if (search) where.OR = search.OR;

  const facetWhere = (s: SiteMeasureStatusFilter): Prisma.SiteMeasureWhereInput => ({
    orgId,
    ...siteMeasureStatusWhere(s),
  });

  const [items, total, all, empty, measured, estimated] =
    await prisma.$transaction([
      prisma.siteMeasure.findMany({
        where,
        orderBy: siteMeasureOrderBy(params.sort),
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        include: SITE_MEASURE_LIST_INCLUDE,
      }),
      prisma.siteMeasure.count({ where }),
      prisma.siteMeasure.count({ where: facetWhere("all") }),
      prisma.siteMeasure.count({ where: facetWhere("empty") }),
      prisma.siteMeasure.count({ where: facetWhere("measured") }),
      prisma.siteMeasure.count({ where: facetWhere("estimated") }),
    ]);

  return { items, total, facets: { all, empty, measured, estimated } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/repositories/siteMeasureRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add lib/repositories/siteMeasureRepo.ts __tests__/repositories/siteMeasureRepo.test.ts
git commit -m "feat: paginate listSiteMeasures (existence-filter buckets)"
```

---

### Task 2.2: Site-measures API route

**Files:**
- Modify: `app/api/site-measures/route.ts` (confirm path)
- Test: `__tests__/api/site-measures.test.ts`

- [ ] **Step 1: Write the failing test** (model on Task 1.6's test; mock `listSiteMeasures`, assert envelope + param passing, assert any existing role guard is preserved).

```ts
// __tests__/api/site-measures.test.ts — core assertions
// (full harness mirrors __tests__/api/estimates.test.ts)
it("passes parsed params and returns the envelope", async () => {
  mockList.mockResolvedValue({ items: [{ id: 1 }], total: 1, facets: { all: 1, empty: 0, measured: 0, estimated: 1 } } as never);
  const res = await GET(req("page=1&perPage=25&status=estimated&sort=customer&dir=asc"), noParams);
  const body = await res.json();
  expect(body.total).toBe(1);
  expect(body.facets.estimated).toBe(1);
  expect(mockList).toHaveBeenCalledWith("org1", expect.objectContaining({
    status: "estimated",
    sort: { key: "customer", direction: "asc" },
  }));
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run __tests__/api/site-measures.test.ts` → FAIL.

- [ ] **Step 3: Implement the GET handler**

```ts
// app/api/site-measures/route.ts — GET (keep existing options/POST)
import { parsePageParams } from "@/lib/pagination/params";
import {
  listSiteMeasures,
  type SiteMeasureSortKey,
  type SiteMeasureStatusFilter,
} from "@/lib/repositories";

const SM_SORT_KEYS = ["id", "customer", "date"] as const satisfies readonly SiteMeasureSortKey[];
const SM_STATUS = ["all", "empty", "measured", "estimated"] as const;

export const GET = apiRoute(/* keep existing options, e.g. { minRole: "lead" } */ async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: SM_SORT_KEYS,
    defaultSort: { key: "date", direction: "desc" },
  });
  const sp = req.nextUrl.searchParams.get("status");
  const status: SiteMeasureStatusFilter =
    sp && (SM_STATUS as readonly string[]).includes(sp)
      ? (sp as SiteMeasureStatusFilter)
      : "all";
  return listSiteMeasures(orgId, { page, perPage, sort, q, status });
});
```

(Match the route's current auth option — check the existing file before replacing GET.)

- [ ] **Step 4: Run to verify it passes.** `npx vitest run __tests__/api/site-measures.test.ts` → PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add app/api/site-measures/route.ts __tests__/api/site-measures.test.ts
git commit -m "feat: site-measures GET returns paginated envelope"
```

---

### Task 2.3: `useSiteMeasures` + `SiteMeasureListView`

**Files:**
- Modify: `lib/hooks/useSiteMeasures.ts`, `components/siteMeasures/SiteMeasureList.tsx`

- [ ] **Step 1: Rework the hook** (mirror Task 1.7 exactly):

```ts
// lib/hooks/useSiteMeasures.ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SortDirection } from "@/lib/sort";

export interface SiteMeasureListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  status: string;
}

export interface SiteMeasureListResponse {
  items: SiteMeasureListItem[]; // existing item type in this file
  total: number;
  facets: Record<string, number>;
}

function qs(p: SiteMeasureListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.status && p.status !== "all") sp.set("status", p.status);
  return sp.toString();
}

async function fetchSiteMeasures(p: SiteMeasureListParams): Promise<SiteMeasureListResponse> {
  const res = await fetch(`/api/site-measures?${qs(p)}`);
  if (!res.ok) throw new Error("Failed to fetch site measures");
  return res.json();
}

export function useSiteMeasures(params: SiteMeasureListParams) {
  return useQuery({
    queryKey: ["siteMeasures", params],
    queryFn: () => fetchSiteMeasures(params),
    placeholderData: keepPreviousData,
  });
}
```

(Keep existing mutation hooks and their `["siteMeasures"]` invalidations unchanged.)

- [ ] **Step 2: Rework `SiteMeasureListView`** (mirror Task 1.8):
- Add `useDebouncedValue(query)`.
- Call `useSiteMeasures({ page, perPage, sort: sort?.key ?? "date", dir: sort?.direction ?? "desc", q: debouncedQuery, status })`.
- `const siteMeasures = data?.items ?? []`, `total = data?.total ?? 0`, `facets = data?.facets ?? {}`.
- Replace `statusCounts` useMemo with `facets`-derived counts: `{ all: facets.all ?? 0, empty: facets.empty ?? 0, measured: facets.measured ?? 0, estimated: facets.estimated ?? 0 }`.
- Remove `filterSiteMeasures`, `sortBy`, `paginate` imports + useMemos; rows map over `siteMeasures`.
- Header "{siteMeasures.length} site measures" → `{facets.all ?? 0}`.
- `Pagination` gets `total` from response.
- Empty states keyed off `facets.all` and `total` as in Task 1.8.

- [ ] **Step 3: Type-check.** `npx tsc --noEmit` → clean.

- [ ] **Step 4: Lint + commit**

```bash
npx biome ci .
git add lib/hooks/useSiteMeasures.ts components/siteMeasures/SiteMeasureList.tsx
git commit -m "feat: site-measures list drives server-side pagination"
```

---

### Task 2.4: Site-measures E2E + phase verification

- [ ] **Step 1:** Update the site-measures E2E spec (paging/filter/search requests carry params; rows update).
- [ ] **Step 2:** `npx vitest run` → PASS; `npx biome ci .` → clean; `npx playwright test --workers=1` → PASS.
- [ ] **Step 3: Commit**

```bash
git add tests/e2e/<spec>
git commit -m "test: site-measures E2E for server-side pagination"
```

---

# Phase 3 — Customers

Drops `lastActivity`. Page selection via `$queryRaw` (count rollups + sort + offset), hydrate via Prisma, cross-faceted pill counts, plus an org-wide header summary.

### Task 3.1: Paginated `listCustomers` repository (raw SQL)

**Files:**
- Modify: `lib/repositories/customerRepo.ts`
- Test: `__tests__/repositories/customerRepo.test.ts`

**Response (extends the envelope):**
```ts
type CustomerListResult = Paginated<CustomerWithCount> & {
  summary: { openEstimates: number; won: number; withOpen: number };
};
```

**Sort keys:** `name`, `source`, `siteMeasures`, `open`. Default `createdAt desc` (the `lastActivity` key is removed).

**Filters:** `source` (= or `all`), `pipeline` (`any` | `open` | `accepted` | `cold`), search `q` (name/phone/email ILIKE).

**facets:** `source:*` counts (respect `q` + active `pipeline`) and `pipeline:*` counts (respect `q` + active `source`) — cross-faceted, matching current behavior.

Because the raw query is intricate, build it in a dedicated module function with validated `ORDER BY` (allow-list → `Prisma.raw`, never interpolate user input).

- [ ] **Step 1: Write the failing test**

The raw path is hard to assert at the query-string level; test the **observable contract** by mocking `prisma.$queryRaw` and `prisma.customer.findMany`:

```ts
// __tests__/repositories/customerRepo.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const customerFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: customerFindMany },
    $queryRaw: queryRaw,
  },
  // Prisma.sql/Prisma.raw used by the repo — re-export real ones:
}));

vi.mock("@/app/generated/prisma/client", async (orig) => {
  const mod = await orig<typeof import("@/app/generated/prisma/client")>();
  return mod;
});

const { listCustomers } = await import("@/lib/repositories/customerRepo");

beforeEach(() => vi.clearAllMocks());

const base = {
  page: 1,
  perPage: 25,
  sort: { key: "name" as const, direction: "asc" as const },
  q: "",
  source: "all" as const,
  pipeline: "any" as const,
};

describe("listCustomers (paginated)", () => {
  it("hydrates the page ids returned by the raw query, preserving order", async () => {
    // First $queryRaw call: page rows (ids in sorted order)
    // Subsequent calls: total + facet aggregates.
    queryRaw
      .mockResolvedValueOnce([{ id: 3 }, { id: 1 }]) // page ids
      .mockResolvedValueOnce([{ count: 2n }]) // total
      .mockResolvedValueOnce([ // source facet rows
        { key: "phone", count: 1n },
        { key: "online", count: 1n },
      ])
      .mockResolvedValueOnce([ // pipeline facet rows
        { key: "any", count: 2n },
        { key: "open", count: 1n },
        { key: "accepted", count: 0n },
        { key: "cold", count: 1n },
      ])
      .mockResolvedValueOnce([{ open: 4n, won: 1n, with_open: 2n }]); // summary

    customerFindMany.mockResolvedValue([
      { id: 1, name: "B" },
      { id: 3, name: "A" },
    ]);

    const res = await listCustomers("org1", base);

    // Page hydrated in the raw query's id order (3 then 1), not findMany's order:
    expect(res.items.map((c) => c.id)).toEqual([3, 1]);
    expect(res.total).toBe(2);
    expect(res.facets["source:phone"]).toBe(1);
    expect(res.facets["pipeline:open"]).toBe(1);
    expect(res.summary).toEqual({ openEstimates: 4, won: 1, withOpen: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run __tests__/repositories/customerRepo.test.ts -t "listCustomers (paginated)"` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/repositories/customerRepo.ts
import { Prisma } from "@/app/generated/prisma/client";
import type { Paginated } from "@/lib/pagination/types";
import type { SortDirection } from "@/lib/sort";
import { prisma } from "@/lib/prisma";

export type CustomerSortKey = "name" | "source" | "siteMeasures" | "open";
export type CustomerPipelineFilter = "any" | "open" | "accepted" | "cold";

export interface ListCustomersParams {
  page: number;
  perPage: number;
  sort: { key: CustomerSortKey; direction: SortDirection };
  q: string;
  source: string; // "all" or a specific source
  pipeline: CustomerPipelineFilter;
}

export type CustomerListResult = Paginated<CustomerWithCount> & {
  summary: { openEstimates: number; won: number; withOpen: number };
};

const OPEN_STATUSES = Prisma.sql`('sent','viewed')`;

// Validated ORDER BY column (no user input interpolation).
const SORT_COLUMN: Record<CustomerSortKey, Prisma.Sql> = {
  name: Prisma.sql`c."name"`,
  source: Prisma.sql`c."source"`,
  siteMeasures: Prisma.sql`site_measure_count`,
  open: Prisma.sql`open_count`,
};

function searchSql(q: string): Prisma.Sql {
  const cleaned = q.trim();
  if (cleaned.length === 0) return Prisma.sql`TRUE`;
  const like = `%${cleaned}%`;
  return Prisma.sql`(c."name" ILIKE ${like} OR c."phone" ILIKE ${like} OR c."email" ILIKE ${like})`;
}

function sourceSql(source: string): Prisma.Sql {
  return source === "all" ? Prisma.sql`TRUE` : Prisma.sql`c."source" = ${source}`;
}

// Pipeline condition expressed against the aggregates (used in HAVING).
function pipelineHaving(p: CustomerPipelineFilter): Prisma.Sql {
  switch (p) {
    case "open":
      return Prisma.sql`COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) > 0`;
    case "accepted":
      return Prisma.sql`COUNT(e.id) FILTER (WHERE e."status" = 'approved') > 0`;
    case "cold":
      return Prisma.sql`COUNT(e.id) = 0`;
    default:
      return Prisma.sql`TRUE`;
  }
}

/** Shared FROM + JOINs + WHERE for the customer aggregate, parameterized by
 *  the active search + source + pipeline. */
function aggregateBase(
  orgId: string,
  q: string,
  source: string,
  pipeline: CustomerPipelineFilter
): Prisma.Sql {
  return Prisma.sql`
    FROM "Customer" c
    LEFT JOIN "Location" loc ON loc."customerId" = c.id
    LEFT JOIN "SiteMeasure" sm ON sm."locationId" = loc.id
    LEFT JOIN "Estimate" e ON e."siteMeasureId" = sm.id
    WHERE c."orgId" = ${orgId}
      AND ${searchSql(q)}
      AND ${sourceSql(source)}
    GROUP BY c.id
    HAVING ${pipelineHaving(pipeline)}
  `;
}

export async function listCustomers(
  orgId: string,
  params: ListCustomersParams
): Promise<CustomerListResult> {
  const { page, perPage, sort, q, source, pipeline } = params;
  const orderCol = SORT_COLUMN[sort.key];
  const orderDir = sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const offset = (page - 1) * perPage;

  // 1) Page of customer ids, in sorted order.
  const pageRows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT c.id,
      COUNT(DISTINCT sm.id) AS site_measure_count,
      COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) AS open_count
    ${aggregateBase(orgId, q, source, pipeline)}
    ORDER BY ${orderCol} ${orderDir}, c.id ASC
    LIMIT ${perPage} OFFSET ${offset}
  `);
  const ids = pageRows.map((r) => r.id);

  // 2) Total matching the filters.
  const totalRows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT c.id ${aggregateBase(orgId, q, source, pipeline)}
    ) sub
  `);
  const total = Number(totalRows[0]?.count ?? 0);

  // 3) Cross-faceted pills.
  //    source facet respects q + active pipeline; bucket by source.
  const sourceFacetRows = await prisma.$queryRaw<{ key: string; count: bigint }[]>(Prisma.sql`
    SELECT key, COUNT(*)::bigint AS count FROM (
      SELECT c."source" AS key ${aggregateBase(orgId, q, "all", pipeline)}
    ) sub GROUP BY key
  `);
  //    pipeline facet respects q + active source; bucket by pipeline membership.
  const pipelineFacetRows = await prisma.$queryRaw<{ key: string; count: bigint }[]>(Prisma.sql`
    SELECT key, COUNT(*)::bigint AS count FROM (
      SELECT c.id,
        CASE WHEN COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) > 0 THEN 'open' END AS open_k,
        CASE WHEN COUNT(e.id) FILTER (WHERE e."status" = 'approved') > 0 THEN 'accepted' END AS acc_k,
        CASE WHEN COUNT(e.id) = 0 THEN 'cold' END AS cold_k
      ${aggregateBase(orgId, q, source, "any")}
    ) sub,
    LATERAL (VALUES ('any'), (open_k), (acc_k), (cold_k)) AS v(key)
    WHERE v.key IS NOT NULL
    GROUP BY v.key
  `);

  // 4) Org-wide header summary (respects no list filters — matches current strip).
  const summaryRows = await prisma.$queryRaw<{ open: bigint; won: bigint; with_open: bigint }[]>(Prisma.sql`
    SELECT
      COALESCE(SUM(open_count), 0)::bigint AS open,
      COALESCE(SUM(accepted_count), 0)::bigint AS won,
      COUNT(*) FILTER (WHERE open_count > 0)::bigint AS with_open
    FROM (
      SELECT c.id,
        COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) AS open_count,
        COUNT(e.id) FILTER (WHERE e."status" = 'approved') AS accepted_count
      FROM "Customer" c
      LEFT JOIN "Location" loc ON loc."customerId" = c.id
      LEFT JOIN "SiteMeasure" sm ON sm."locationId" = loc.id
      LEFT JOIN "Estimate" e ON e."siteMeasureId" = sm.id
      WHERE c."orgId" = ${orgId}
      GROUP BY c.id
    ) sub
  `);

  // 5) Hydrate the page rows with the existing payload shape, in id order.
  const hydrated = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids } },
        include: {
          _count: { select: { locations: true } },
          locations: {
            select: { siteMeasures: { select: { estimates: { select: LIST_ESTIMATE_SELECT } } } },
          },
        },
      })
    : [];
  const byId = new Map(hydrated.map((c) => [c.id, c]));
  const items = ids.map((id) => byId.get(id)).filter(Boolean) as CustomerWithCount[];

  const facets: Record<string, number> = {};
  for (const r of sourceFacetRows) facets[`source:${r.key}`] = Number(r.count);
  for (const r of pipelineFacetRows) facets[`pipeline:${r.key}`] = Number(r.count);

  return {
    items,
    total,
    facets,
    summary: {
      openEstimates: Number(summaryRows[0]?.open ?? 0),
      won: Number(summaryRows[0]?.won ?? 0),
      withOpen: Number(summaryRows[0]?.with_open ?? 0),
    },
  };
}
```

> `LIST_ESTIMATE_SELECT` already exists at the top of `customerRepo.ts`. Keep it. The `CustomerWithCount` type also already exists.

- [ ] **Step 4: Run to verify it passes.** `npx vitest run __tests__/repositories/customerRepo.test.ts` → PASS. Fix the old `listCustomers` test (the "scopes by orgId" one) — replace it with the paginated test above.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add lib/repositories/customerRepo.ts __tests__/repositories/customerRepo.test.ts
git commit -m "feat: paginate listCustomers via raw-SQL count rollups"
```

> **Integration check (manual, against dev DB):** the raw SQL is not exercised by mocked unit tests. Before merging, run the customers list in the app (Task 3.3) and confirm counts/sort/filter match a hand-count on seed data. Optionally add a `VITEST_DB_AVAILABLE`-gated integration test that runs the real query against a seeded DB.

---

### Task 3.2: Customers API route

**Files:**
- Modify: `app/api/customers/route.ts`
- Test: `__tests__/api/customers.test.ts`

- [ ] **Step 1: Write the failing test** (mirror Task 1.6; mock `listCustomers`; assert envelope incl. `summary`, param passing — `source`, `pipeline`, sort — and the unchanged `minRole: "lead"` guard).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the GET handler**

```ts
// app/api/customers/route.ts
import { apiRoute } from "@/lib/api/route";
import { customerCreateSchema } from "@/lib/customers/schema";
import { parsePageParams } from "@/lib/pagination/params";
import {
  type CustomerPipelineFilter,
  type CustomerSortKey,
  createCustomer,
  listCustomers,
} from "@/lib/repositories";

const CUST_SORT_KEYS = ["name", "source", "siteMeasures", "open"] as const satisfies readonly CustomerSortKey[];
const PIPELINES = ["any", "open", "accepted", "cold"] as const;

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: CUST_SORT_KEYS,
    defaultSort: { key: "name", direction: "asc" }, // see note in Task 3.3 re: createdAt default
  });
  const sp = req.nextUrl.searchParams;
  const source = sp.get("source") ?? "all";
  const pipelineRaw = sp.get("pipeline");
  const pipeline: CustomerPipelineFilter =
    pipelineRaw && (PIPELINES as readonly string[]).includes(pipelineRaw)
      ? (pipelineRaw as CustomerPipelineFilter)
      : "any";

  return listCustomers(orgId, { page, perPage, sort, q, source, pipeline });
});

export const POST = apiRoute(
  { minRole: "lead", input: customerCreateSchema, status: 201 },
  async ({ orgId, input }) => createCustomer(orgId, input)
);
```

> **Default sort note:** the spec sets the customers default to `createdAt desc`. `createdAt` is **not** a sortable column in the raw query's `SORT_COLUMN` map and is not a UI sort key. To honor "newest first" as the *initial* order without adding a UI sort control for it, either (a) add `createdAt` to `SORT_COLUMN` and use it as the parser default (`defaultSort: { key: "createdAt", direction: "desc" }`, and add `"createdAt"` to `CustomerSortKey`/`CUST_SORT_KEYS` but NOT to the visible `SortableHeader`s), or (b) keep the visible default as `name asc`. **Pick (a)** to match the spec: add `createdAt: Prisma.sql\`c."createdAt"\`` to `SORT_COLUMN`, extend `CustomerSortKey` with `"createdAt"`, and set both the route parser default and the `useTableQueryState` default to `createdAt`/`desc`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add app/api/customers/route.ts __tests__/api/customers.test.ts lib/repositories/customerRepo.ts
git commit -m "feat: customers GET returns paginated envelope with summary"
```

---

### Task 3.3: `useCustomers` + `CustomerListView` (drops lastActivity)

**Files:**
- Modify: `lib/hooks/useCustomers.ts`, `components/customers/CustomerList.tsx`

- [ ] **Step 1: Rework the hook** (mirror Task 1.7; add `source`/`pipeline`; response carries `summary`):

```ts
// lib/hooks/useCustomers.ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SortDirection } from "@/lib/sort";

export interface CustomerListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  source: string;
  pipeline: string;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  facets: Record<string, number>;
  summary: { openEstimates: number; won: number; withOpen: number };
}

function qs(p: CustomerListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.source && p.source !== "all") sp.set("source", p.source);
  if (p.pipeline && p.pipeline !== "any") sp.set("pipeline", p.pipeline);
  return sp.toString();
}

async function fetchCustomers(p: CustomerListParams): Promise<CustomerListResponse> {
  const res = await fetch(`/api/customers?${qs(p)}`);
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json();
}

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () => fetchCustomers(params),
    placeholderData: keepPreviousData,
  });
}
```

(Keep `useCustomer(id)` and the mutation hooks unchanged.)

- [ ] **Step 2: Rework `CustomerListView`:**
- Add `useDebouncedValue(query)`.
- `validSortKeys` becomes `["name", "source", "siteMeasures", "open", "createdAt"]`; `defaultSort: { key: "createdAt", direction: "desc" }`. **Remove `"lastActivity"`.**
- Call `useCustomers({ page, perPage, sort: sort?.key ?? "createdAt", dir: sort?.direction ?? "desc", q: debouncedQuery, source: filter, pipeline })`.
- `const summarized = (data?.items ?? []).map((c) => ({ customer: c, summary: summarize(c) }))` — `summarize()` stays for **display** (the per-row counts come from the hydrated nested payload), but **remove the `lastActivity`/`last` computation** from `summarize` (delete the `last` variable and `lastActivity` field from `CustomerSummary`).
- Replace the single-pass `{ filtered, sourceCounts, pipelineCounts }` useMemo with values from the response:
  ```ts
  const sourceCounts: Record<string, number> = {};
  for (const s of SOURCES) sourceCounts[s] = data?.facets[`source:${s}`] ?? 0;
  const pipelineCounts = {
    any: data?.facets["pipeline:any"] ?? 0,
    open: data?.facets["pipeline:open"] ?? 0,
    accepted: data?.facets["pipeline:accepted"] ?? 0,
    cold: data?.facets["pipeline:cold"] ?? 0,
  };
  ```
- Replace the `totals` useMemo with `const totals = data?.summary ?? { openEstimates: 0, won: 0, withOpen: 0 }`.
- Remove the `sorted`/`paginate` blocks; rows map over `summarized` directly.
- **Remove the "Last activity" `SortableHeader`** and the table column rendering `relativeTime(summary.lastActivity)` — replace that grid cell with the existing "{summary.total} estimates" sub-line only, or repurpose the column. Adjust the grid template `grid-cols-[1fr_120px_70px_70px_120px_90px]` accordingly (drop the 120px lastActivity column → `grid-cols-[1fr_120px_70px_70px_90px]`), in both the header row and the data row.
- Remove the `lastActivity` entry from the `sortBy` accessors (the whole `sortBy` call is removed anyway).
- Remove now-unused imports: `sortBy`, `paginate`, `filterCustomers`, `lastTouchAt`, `relativeTime` (keep `isOpenEstimate` if still used by `summarize`).
- Header counts: `{customers.length}` → `{total}`; the open/won strip reads `totals`.
- `Pagination` gets `total` from response.

- [ ] **Step 3: Confirm helper retention.** `lastTouchAt`/`relativeTime` remain in `lib/estimateStatus.ts` (still used by `CustomerPipeline`, `CustomerStatStrip`, `CustomerDetail`). Do **not** delete them there.

- [ ] **Step 4: Type-check.** `npx tsc --noEmit` → clean.

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci .
git add lib/hooks/useCustomers.ts components/customers/CustomerList.tsx
git commit -m "feat: customers list server-side pagination; drop lastActivity"
```

---

### Task 3.4: Customers E2E + final verification

- [ ] **Step 1:** Update the customers E2E spec: paging/source-pill/pipeline-pill/search requests carry params; `summary` strip + pill counts reflect server `facets`; the "Last activity" column is gone.
- [ ] **Step 2: Full gates**
  - `npx vitest run` → all PASS
  - `npx biome ci .` → clean
  - `npx playwright test --workers=1` → PASS
- [ ] **Step 3: Commit**

```bash
git add tests/e2e/<spec>
git commit -m "test: customers E2E for server-side pagination"
```

---

## Plan self-review

**Spec coverage:**
- Shared contract (params, `{items,total,facets}`, debounce, keepPreviousData, `perPage` in state) → Tasks 0.1–0.3, 1.7, 1.8. ✓
- Estimates: denormalized `total` (write paths + backfill + seed + index) + paginated repo/route/hook/UI → Tasks 1.1–1.9. ✓
- Site measures (existence-filter buckets, native sorts, facets) → Tasks 2.1–2.4. ✓
- Customers (raw-SQL rollups, cross-faceted pills, header summary, drop lastActivity, createdAt default) → Tasks 3.1–3.4. ✓
- Events out of scope → not implemented (correct). ✓
- Facet semantics preserved (absolute for estimates/site-measures; cross-faceted for customers) → encoded in repo tasks. ✓
- DB: `total` column + `@@index([orgId])` on Customer/Estimate/SiteMeasure + seed update → Task 1.1, 1.4. ✓
- Migration safety (additive nullable, separate backfill, no squash) → Task 1.1 Step 3, Task 1.3. ✓

**Open items from the spec, now resolved:** composite indexes → single `@@index([orgId])` chosen (composite on orderBy columns deferred unless a slow query shows up); customer hydration → ids-then-hydrate (Task 3.1 Step 3); backfill → TS script (Task 1.3).

**Known fidelity changes (called out, not silent):** (1) estimate/site-measure numeric search is exact-match, not substring; (2) customer `lastActivity` removed; default sort → `createdAt desc`.

**Type consistency:** `Paginated<T>`, `parsePageParams`, `EstimateSortKey`/`SiteMeasureSortKey`/`CustomerSortKey`, `ListXParams`, hook `XListParams`/`XListResponse`, and `facets` key conventions (`source:*`, `pipeline:*`) are used consistently across tasks.

**Placeholders:** none — every code step shows complete code; the only deliberately-deferred specifics (exact E2E spec filenames, the customers route auth option to match) are flagged with how to resolve (`Glob` / read the existing file).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-01-server-side-list-pagination.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
