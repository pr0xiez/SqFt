# Org-wide Invoices list page — design

**Date:** 2026-06-09
**Status:** Approved

## Problem

Invoices currently exist only as a section under an estimate's detail page
(`components/invoices/InvoicesSection.tsx`, fed by
`/api/estimates/[id]/invoices`). A customer asked for an Invoices tab with a
table so she can quickly see **open invoices — sent but not yet paid — across
the whole org**, without navigating estimate by estimate.

## Decision summary

- New top-level `/invoices` page mirroring the Estimates list end-to-end
  (Approach A): new org-wide list API + repo function + react-query hook +
  list component + nav tab.
- **Default view is the "Open" status filter** (`sent + viewed + partial`),
  with pills for All / Open / Draft / Paid / Void and facet counts.
- Full table parity with Estimates: debounced search, sortable columns,
  pagination, density toggle, responsive mobile layout.
- Columns: Invoice # · Customer · Status · Amount · Balance due · Due date ·
  Sent date. **Balance due is display-only (not sortable) in v1** — sorting a
  derived `amount − Σ payments` column in Prisma without breaking pagination
  isn't worth it yet.
- Overdue rows (open status + due date in the past) get red due-date styling.
- Lead+ only, same gating as Estimates; crew never sees the tab.

## API

`GET /api/invoices` — new handler in `app/api/invoices/route.ts` (folder
already exists, currently only `[id]/`). Wraps `apiRoute`; errors use the
`ApiError` envelope from `lib/api/errors.ts`.

Query params (mirroring `/api/estimates`):

| Param | Values | Default |
|---|---|---|
| `page`, `perPage` | ints | 1, 20 |
| `sort` | `number \| customer \| amount \| dueDate \| sentAt` | `sentAt` |
| `dir` | `asc \| desc` | `desc` |
| `q` | matches customer name (contains, case-insensitive) or invoice number | — |
| `status` | `all \| open \| draft \| paid \| void` | `open` |

`open` expands to `status IN ('sent','viewed','partial')`. This mapping lives
in the repo only.

Response: `{ invoices, total, page, perPage, facets }` where `facets` holds
counts per pill (all/open/draft/paid/void) for the current `q` (search applies
to facets; the status filter does not, so pill counts stay stable while
switching pills).

Each list item: `id, invoiceNumber, status, amount, balanceDue, dueDate,
sentAt, customerName, estimateId`.

## Repo

`listInvoices(orgId, params)` in `lib/repositories/invoiceRepo.ts`:

- Prisma `findMany` org-scoped, including `payments` and
  `estimate → location → customer` (name only).
- `balanceDue = round2(amount − Σ payments.amount)` using `lib/money.ts`.
- Facet counts via `groupBy(status)` with the same org + search `where`.
- Sort `customer` orders by the joined customer name; others are direct
  columns. `sentAt desc` puts never-sent drafts last (nulls last).

## Hook

`useInvoiceList(params: InvoiceListParams)` added to
`lib/hooks/useInvoices.ts`. Query key `["invoices", "list", params]`,
`keepPreviousData: true`. The existing per-estimate `useInvoices(estimateId)`
and all mutation hooks are untouched; mutations already invalidate
`["invoices"]`-rooted keys, which refreshes the list.

## UI

- `app/(app)/invoices/page.tsx` — SSR wrapper identical in shape to
  `app/(app)/estimates/page.tsx`: `requireSession`, `hasMinRole(role,
  "lead")` redirect, `<Suspense>` around the list view.
- `components/invoices/InvoiceList.tsx` — cloned from
  `components/estimates/EstimateList.tsx`: `useTableQueryState`,
  `useDebouncedValue` search, status pills (Open listed first and default),
  `SortableHeader` columns, pagination, density toggle, mobile collapse.
- Row links to `/invoices/[id]`. Status rendered with the existing invoice
  status badge styling. Overdue = open status && `dueDate < today` → red due
  date text.
- Nav: add `{ href: "/invoices", label: "Invoices", screen: "invoices" }`
  after Estimates in `NAV_TABS` (`components/ui/AppNav.tsx`); existing
  `navTabsFor(role)` lead+ filtering covers gating.

## Error handling

- API: invalid `page/perPage/sort/dir/status` → 400 `ApiError` (same
  validation style as the estimates list handler).
- UI: loading / error / empty states copied from `EstimateList`; the Open
  pill's empty state says "No open invoices" (a positive, not an error).

## Testing

- **Vitest (repo):** `listInvoices` — `open` status mapping, search by
  customer name and invoice number, facet counts, `balanceDue` with partial
  payments, pagination + sort, org scoping.
- **Vitest (API):** param validation and envelope shape for
  `GET /api/invoices`.
- **Component:** `InvoiceList` renders rows, pill switching, empty state —
  matching the depth of existing `EstimateList` tests.
- **Playwright e2e (run `--workers=1`):** login → Invoices tab → seeded open
  invoice visible → switch to Paid pill → paid invoice visible.
- **Seed:** ensure `prisma/seed.ts` creates invoices in mixed statuses
  (at least one sent/partial with a payment, one paid, one draft).

## Out of scope (v1)

- Sorting by balance due.
- Date-range / customer filters beyond search.
- No schema changes; no migrations.

## Docs to update in the same change

- `CONTEXT.md`: org-wide invoice list endpoint + the "open" status group.
- `AGENTS.md`: add `invoices` to the `app/(app)/` route-group list.
