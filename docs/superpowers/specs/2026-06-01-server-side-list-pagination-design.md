# Server-Side Pagination for List Views — Design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)

## Problem

The estimates, customers, and site-measures list repositories use `prisma.X.findMany({ where: { orgId }, … })` with no `take`/`skip`. As an org's data grows these queries return unbounded result sets, and the entire dataset is shipped to the client on every list view load.

The list **UX already has pagination** — search, faceted filtering (with live pill counts), sorting, and a "tape-measure" `Pagination` control — but **all of it runs client-side over the full org dataset**, then `paginate()` slices the array. The goal is to shift that data burden to the server while preserving the existing UX.

### Why this is more than `skip`/`take`

Because search, filter, sort, and facet counts currently operate on the full client array, returning only one page from the server means **all four must move server-side** — otherwise they would only act on the 25 rows that happened to be fetched.

The wall is **derived fields**: several sort/filter inputs are not columns but values computed in app code from relations. After design discussion these resolve as follows.

## Scope

| List | In scope? | Notes |
|------|-----------|-------|
| **Estimates** | ✅ Phase 1 (tracer) | Status filter is a native column; only `total` is derived. |
| **Site measures** | ✅ Phase 2 | Missed by the original finding; same unbounded pattern + same client UX. |
| **Customers** | ✅ Phase 3 | Count rollups + cross-faceted pills; the most intricate. |
| **Events** | ❌ Out of scope | Consumed by `CalendarGrid` / dashboard cards, not a paginated table. A calendar needs all events in its window. If its unbounded query becomes a problem, the correct fix is **date-range scoping** (`where: { date: { gte, lte } }`), not offset pagination. |

### Explicit feature change

**`lastActivity` is dropped from the customers list.** It was the single derived field that depended on five different estimate write paths (sent/viewed/approved/declined/revised), making any denormalization brittle. Removing it means **every remaining customer derived field is a pure count.**

This requires:
- Removing the "Last activity" sortable column from `CustomerList`.
- Removing the `lastActivity` sort key (and its `validSortKeys` entry).
- Changing the customers default sort from `lastActivity desc` → **`createdAt desc`** (newest first; closest to the old "recent-first" feel and consistent with the other lists' date-desc default).
- Removing `lastTouchAt`/`relativeTime` usage in `CustomerList.summarize()` (verify these helpers in `lib/estimateStatus` are not used elsewhere before removing them there).

## Approach: offset pagination, hybrid per-list derived-field handling

Offset (`skip`/`take` + `total`) was chosen over cursor because these lists are page-numbered tables with jump-to-page and "Page N of M" UX, not infinite-scroll feeds.

Derived fields are handled per-list by the cheapest correct technique:

- **Estimates** → **denormalize `total`** (a maintained column), because the formula already lives in TS (`computeEstimateView`) and `total` is read on every list render. The TS function stays the single source of truth; the DB caches its result.
- **Site measures** → **Prisma existence filters**; no raw SQL, no denormalization.
- **Customers** → **`$queryRaw` for the page selection** (compute counts + order + limit/offset), no denormalization (avoids re-introducing write-path coupling).

## The shared contract (defined by Phase 1, reused by Phases 2–3)

### API GET query params (all in-scope lists)

| Param | Meaning | Default |
|-------|---------|---------|
| `page` | 1-based page number | `1` |
| `perPage` | rows per page; validated against `PER_PAGE_OPTIONS` (`25, 50, 100`) | `25` |
| `sort` | sort key (validated per-list) | per-list default |
| `dir` | `asc` \| `desc` | per-list default |
| `q` | free-text search | empty |
| *(per-list filters)* | estimates: `status`; site measures: `status`; customers: `source`, `pipeline` | `all` / `any` |

Invalid params are clamped/ignored server-side (e.g. `perPage` not in the allow-list falls back to default; `page < 1` → 1). This mirrors the existing client clamping in `Pagination`/`useTableQueryState`.

### Response envelope

```ts
type PaginatedResponse<T> = {
  items: T[];
  total: number;                    // count of rows matching the active filters (drives pageCount)
  facets: Record<string, number>;   // counts for the filter pills
};
```

### Facet-count semantics (preserved exactly as today, per list)

- **Estimates & site measures:** pills show **absolute** counts over the org (current code computes them over the full fetched set, ignoring the search box and the active status). → one aggregate, independent of `q`/`status`.
- **Customers:** pills are **cross-faceted** — `sourceCounts` respects `q` + the active `pipeline`; `pipelineCounts` respects `q` + the active `source` (matches the single-pass cross-dimensional computation in `CustomerListView`). → two scoped aggregate queries.

### Client/hook changes

- Query params become part of the React Query `queryKey`, so changing page/sort/filter/search refetches.
- Use `placeholderData: keepPreviousData` to avoid flicker while paging.
- **Debounce the `q` param** before it enters the query key (search is currently instant client-side filtering; server round-trips need debouncing).
- `useTableQueryState` remains the source of truth for sort/page/perPage/density and continues to sync sort/page to the URL — it now feeds the hook's params instead of feeding `paginate()`.
- The `paginate()` client slice is removed from the three list views; `Pagination` is driven by the server-returned `total`.
- `perPage` is added to the URL/state contract consistently (today it lives only in localStorage).

## Per-list implementation detail

### Phase 1 — Estimates (tracer)

- **Repository** `listEstimates(orgId, params)` returns `{ items, total, facets }`.
  - Stays in Prisma's query builder.
  - `where`: `orgId` + optional `status` + search `q` (estimate number, customer name via `siteMeasure.location.customer.name`, address) using `OR` `contains` (case-insensitive).
  - `orderBy`: maps UI sort keys — `number→estimateNumber`, `status→status`, `date→date`, `customer→{ siteMeasure: { location: { customer: { name } } } }`, `siteMeasure→{ siteMeasure: { siteMeasureNumber } }`, `total→total` (the new column).
  - `total`: `prisma.estimate.count({ where })`.
  - `facets`: `prisma.estimate.groupBy({ by: ['status'], where: { orgId } })` → `{ all, draft, sent, approved, declined }`.
  - Run page query + count (+ groupBy) inside a single `$transaction` for a consistent snapshot.
- **Schema:** add `total Float?` to `Estimate`. Recompute it via `computeEstimateView(fromPrismaEstimate(...))` inside `createEstimate` and `saveEstimate` transactions (any write that changes line items / markup / fee / convenience fee). Migration backfills existing rows.
- **API** `app/api/estimates/route.ts` GET: parse params, call repo, return envelope. Existing `minRole: "lead"` guard unchanged. The current per-row `total` mapping moves into the repo (reads the column).
- **Hook/UI:** `useEstimates(params)` + `EstimateListView` switch to server-driven; status pills read `facets`; `total`/`pageCount` from response.

This phase establishes the param contract, the envelope, the hook pattern, and the denormalization pattern.

### Phase 2 — Site measures

- **Repository** `listSiteMeasures(orgId, params)` → `{ items, total, facets }`, fully in Prisma.
  - Status buckets as **existence filters**:
    - `empty` (no rooms): `items: { none: { type: "room" } }`
    - `measured` (rooms, no estimates): `items: { some: { type: "room" } }, estimates: { none: {} }`
    - `estimated` (rooms + estimates): `items: { some: { type: "room" } }, estimates: { some: {} }`
  - `orderBy`: `id`, `date`, `customer→{ location: { customer: { name } } }` — all native/relation.
  - Search `q`: site-measure number + customer name.
  - `facets`: 3 `count()` calls with the bucket `where` clauses (absolute, per preserved semantics).
- **API/Hook/UI:** mirror Phase 1.

### Phase 3 — Customers

- **Repository** `listCustomers(orgId, params)` → `{ items, total, facets }`.
  - **Page selection via `$queryRaw`**: a query that, scoped to `orgId` + active filters + search, computes per-customer `siteMeasureCount`, `openCount`, `acceptedCount`, `totalEstimateCount`, applies `ORDER BY` (including derived counts `open`/`siteMeasures`), and `LIMIT/OFFSET`. Returns the page's customer ids (+ the computed counts).
  - **Hydration**: fetch the full `CustomerWithCount`-shaped rows for those ids via Prisma (preserving the existing payload the UI expects), re-ordered to match the raw query's order.
  - `total`: count of customers matching the filters (scalar from a `COUNT(*)` variant of the same filtered query).
  - **Pipeline filters** (existence, also expressible in the raw `WHERE`): `open` = has an open-status estimate; `accepted`/won = has an approved estimate; `cold` = has zero estimates.
  - **Facets (cross-faceted):**
    - `sourceCounts`: group customers by `source`, applying `q` + active `pipeline`.
    - `pipelineCounts`: bucket customers into any/open/accepted/cold, applying `q` + active `source`.
- **Sort keys** after the `lastActivity` drop: `name`, `source`, `siteMeasures`, `open`. Default `createdAt desc`.
- **API/Hook/UI:** mirror earlier phases; remove the Last activity column and sort key; update default sort.

## Schema / DB changes

- `Estimate.total Float?` — nullable, backfilled by migration using the TS formula values (migration generates `UPDATE`s or a follow-up backfill step).
- `@@index([orgId])` on `Customer`, `Estimate`, `SiteMeasure` — none exist today, so the paginated `where: { orgId } ORDER BY …` would otherwise scan. (Optionally composite indexes on the common `orderBy` columns, e.g. `@@index([orgId, createdAt])`, decided in the plan.)
- Update `prisma/seed.ts` to populate `Estimate.total` (per AGENTS.md: seed must reflect schema changes).

### Migration safety (per project memory)

- The schema change is **additive** — `ADD COLUMN total Float NULL` is safe on the populated Neon PR branch (no `NOT NULL` default-less column → no 23502).
- Backfill runs as its own step, not inside the `ADD COLUMN`, keeping the non-atomic `prisma migrate deploy` safe.
- Add a new migration on top; never squash existing ones.

## Testing

- **Repository unit tests:** param→query mapping (where/orderBy/skip/take), `total` and `facets` correctness, the estimate `total` recompute on create/save, customer raw-SQL counts + ordering + cross-faceted facets, site-measure existence-filter buckets. Gate any real-DB tests on `VITEST_DB_AVAILABLE`.
- **API route tests:** param parsing/clamping, envelope shape, unchanged role guards (`minRole: "lead"`).
- **E2E:** update the existing list specs for server-driven paging (page nav refetches, filters/search hit the server, pill counts from `facets`). Run Playwright with `--workers=1` locally to match CI.

## Out of scope

- Events pagination (calendar consumer — use date-range scoping if needed later).
- Cursor pagination (offset chosen deliberately for page-numbered UX).
- Denormalizing customer count rollups (raw SQL chosen to avoid write-path coupling; revisit only if the raw query proves hot).

## Open items for the plan

- Exact composite index columns per list.
- Whether the customer raw query returns hydrated rows directly (JSON aggregation) or ids-then-hydrate (leaning ids-then-hydrate for type-safety with the existing Prisma payload).
- Backfill mechanism for `Estimate.total` (inline migration SQL vs. a one-off script).
