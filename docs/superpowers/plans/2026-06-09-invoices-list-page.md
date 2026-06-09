# Org-wide Invoices List Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A top-level `/invoices` page (lead+ only) listing all org invoices, defaulting to the "Open" filter (sent + viewed + partial), with search, sortable columns, pagination, and facet-counted status pills.

**Architecture:** Mirror the Estimates list end-to-end: `listInvoices` in `invoiceRepo.ts` → `GET /api/invoices` via `apiRoute` → `useInvoiceList` react-query hook → `InvoiceListView` component cloned from `EstimateList` → nav tab. No schema changes, no migrations.

**Tech Stack:** Next.js App Router, Prisma/Postgres, @tanstack/react-query, Tailwind-style utility classes with CSS vars, Vitest (+ jsdom for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-09-invoices-list-page-design.md`

**Conventions the executor must know:**
- This repo's Next.js has breaking changes vs. training data. Every file in this plan clones an existing working file — follow the clone source exactly. If you must deviate, read the relevant guide in `node_modules/next/dist/docs/` first.
- `npm run lint:ci` must pass before every commit. Run `npm run lint:fix` to auto-fix.
- Unit tests live in `__tests__/` (repo root), e2e in `tests/e2e/`. Run e2e with `--workers=1`.
- Repo tests mock `@/lib/prisma` (see `__tests__/repositories/estimateRepo.test.ts`); API tests mock `@/lib/repositories` and `@/lib/tenant` (see `__tests__/api/estimates.test.ts`).

---

### Task 1: Status-filter module + `listInvoices` repository function

**Files:**
- Create: `components/invoices/filterInvoices.ts`
- Modify: `lib/repositories/invoiceRepo.ts` (append; barrel `lib/repositories/index.ts` already re-exports `./invoiceRepo`, no barrel change needed)
- Test: `__tests__/repositories/invoiceRepoList.test.ts`

- [ ] **Step 1: Create the client-safe status-filter module**

Create `components/invoices/filterInvoices.ts` (mirrors `components/estimates/filterEstimates.ts`, which `estimateRepo.ts` also imports — this module must stay free of server-only imports):

```ts
export type InvoiceStatusFilter = "all" | "open" | "draft" | "paid" | "void";

/** "Open" = sent to the customer but not yet fully paid. */
export const OPEN_INVOICE_STATUSES = ["sent", "viewed", "partial"] as const;
```

- [ ] **Step 2: Write the failing repo test**

Create `__tests__/repositories/invoiceRepoList.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoiceFindMany = vi.fn();
const invoiceCount = vi.fn();
const invoiceGroupBy = vi.fn();

const $transaction = vi.fn(async (arg: Promise<unknown>[]) =>
  Promise.all(arg)
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: invoiceFindMany,
      count: invoiceCount,
      groupBy: invoiceGroupBy,
    },
    $transaction,
  },
}));

const { listInvoices } = await import("@/lib/repositories/invoiceRepo");

const baseParams = {
  page: 1,
  perPage: 25,
  sort: { key: "sentAt" as const, direction: "desc" as const },
  q: "",
  status: "all" as const,
};

/** A minimal raw row as returned by findMany with INVOICE_LIST_INCLUDE. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    invoiceNumber: 9001,
    status: "sent",
    amount: 1000,
    dueDate: null,
    sentAt: new Date("2026-06-01T00:00:00Z"),
    estimateId: 5,
    payments: [],
    estimate: {
      siteMeasure: {
        location: { customer: { name: "Dana Floors" } },
      },
    },
    ...over,
  };
}

function mockGroupBy() {
  invoiceGroupBy.mockResolvedValue([
    { status: "draft", _count: { _all: 1 } },
    { status: "sent", _count: { _all: 2 } },
    { status: "partial", _count: { _all: 1 } },
    { status: "paid", _count: { _all: 3 } },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listInvoices", () => {
  it("scopes by org, applies skip/take and null-last sentAt orderBy, maps rows", async () => {
    invoiceFindMany.mockResolvedValue([
      rawRow({ payments: [{ amount: 250 }, { amount: 100 }] }),
    ]);
    invoiceCount.mockResolvedValue(7);
    mockGroupBy();

    const res = await listInvoices("org1", {
      ...baseParams,
      page: 2,
      perPage: 25,
    });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { sentAt: { sort: "desc", nulls: "last" } },
        skip: 25,
        take: 25,
      })
    );
    expect(res.total).toBe(7);
    expect(res.items).toEqual([
      {
        id: 1,
        invoiceNumber: 9001,
        status: "sent",
        amount: 1000,
        balanceDue: 650,
        dueDate: null,
        sentAt: new Date("2026-06-01T00:00:00Z"),
        estimateId: 5,
        customerName: "Dana Floors",
      },
    ]);
  });

  it("expands the open filter to sent+viewed+partial", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", { ...baseParams, status: "open" });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          status: { in: ["sent", "viewed", "partial"] },
        },
      })
    );
  });

  it("filters by a single status when not 'all' or 'open'", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", { ...baseParams, status: "paid" });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1", status: "paid" } })
    );
  });

  it("searches customer name and exact invoice number for numeric queries", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", { ...baseParams, q: "#9001" });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          OR: [
            {
              estimate: {
                siteMeasure: {
                  location: {
                    customer: {
                      name: { contains: "9001", mode: "insensitive" },
                    },
                  },
                },
              },
            },
            { invoiceNumber: 9001 },
          ],
        },
      })
    );
  });

  it("maps the customer sort key to the nested relation orderBy", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", {
      ...baseParams,
      sort: { key: "customer", direction: "asc" },
    });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          estimate: {
            siteMeasure: { location: { customer: { name: "asc" } } },
          },
        },
      })
    );
  });

  it("computes facets org-wide, with open = sent+viewed+partial", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    const res = await listInvoices("org1", { ...baseParams, status: "paid" });

    // facets ignore the status filter (groupBy where is org-only)
    expect(invoiceGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
    expect(res.facets).toEqual({
      all: 7,
      open: 3,
      draft: 1,
      sent: 2,
      viewed: 0,
      partial: 1,
      paid: 3,
      void: 0,
    });
  });

  it("rounds balanceDue to cents", async () => {
    invoiceFindMany.mockResolvedValue([
      rawRow({ amount: 100, payments: [{ amount: 33.333 }] }),
    ]);
    invoiceCount.mockResolvedValue(1);
    mockGroupBy();

    const res = await listInvoices("org1", baseParams);
    expect(res.items[0].balanceDue).toBe(66.67);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run __tests__/repositories/invoiceRepoList.test.ts`
Expected: FAIL — `listInvoices` is not exported from `@/lib/repositories/invoiceRepo`.

- [ ] **Step 4: Implement `listInvoices`**

In `lib/repositories/invoiceRepo.ts`, add to the existing imports at the top:

```ts
import {
  type InvoiceStatusFilter,
  OPEN_INVOICE_STATUSES,
} from "@/components/invoices/filterInvoices";
import type { Paginated } from "@/lib/pagination/types";
import type { SortDirection } from "@/lib/sort";
```

(`Prisma` type and `prisma` client are already imported. A local `round2` already exists at the top of this file — reuse it.)

Then append at the end of the file:

```ts
export type InvoiceSortKey =
  | "number"
  | "customer"
  | "amount"
  | "dueDate"
  | "sentAt";

export interface ListInvoicesParams {
  page: number;
  perPage: number;
  sort: { key: InvoiceSortKey; direction: SortDirection };
  q: string;
  status: InvoiceStatusFilter;
}

/** Flat row shape for the org-wide invoices list. */
export interface InvoiceListRow {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  balanceDue: number;
  dueDate: Date | null;
  sentAt: Date | null;
  estimateId: number;
  customerName: string | null;
}

const INVOICE_LIST_INCLUDE = {
  payments: { select: { amount: true } },
  estimate: {
    select: {
      siteMeasure: {
        select: {
          location: { select: { customer: { select: { name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

function invoiceOrderBy(
  sort: ListInvoicesParams["sort"]
): Prisma.InvoiceOrderByWithRelationInput {
  const dir = sort.direction;
  switch (sort.key) {
    case "number":
      return { invoiceNumber: dir };
    case "customer":
      return {
        estimate: { siteMeasure: { location: { customer: { name: dir } } } },
      };
    case "amount":
      return { amount: dir };
    case "dueDate":
      return { dueDate: { sort: dir, nulls: "last" } };
    default:
      return { sentAt: { sort: dir, nulls: "last" } };
  }
}

function invoiceSearchWhere(q: string): Prisma.InvoiceWhereInput | null {
  const cleaned = q.trim().replace(/^#/, "");
  if (cleaned.length === 0) return null;
  const or: Prisma.InvoiceWhereInput[] = [
    {
      estimate: {
        siteMeasure: {
          location: {
            customer: { name: { contains: cleaned, mode: "insensitive" } },
          },
        },
      },
    },
  ];
  if (/^\d+$/.test(cleaned)) or.push({ invoiceNumber: Number(cleaned) });
  return { OR: or };
}

export async function listInvoices(
  orgId: string,
  params: ListInvoicesParams
): Promise<Paginated<InvoiceListRow>> {
  const where: Prisma.InvoiceWhereInput = { orgId };
  if (params.status === "open") {
    where.status = { in: [...OPEN_INVOICE_STATUSES] };
  } else if (params.status !== "all") {
    where.status = params.status;
  }
  const search = invoiceSearchWhere(params.q);
  if (search) Object.assign(where, search);

  const [rows, total, grouped] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: invoiceOrderBy(params.sort),
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: INVOICE_LIST_INCLUDE,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { _all: true },
      orderBy: undefined,
    }),
  ]);

  const facets: Record<string, number> = {
    all: 0,
    open: 0,
    draft: 0,
    sent: 0,
    viewed: 0,
    partial: 0,
    paid: 0,
    void: 0,
  };
  for (const row of grouped) {
    const count = row._count;
    const n = typeof count === "object" ? (count._all ?? 0) : 0;
    facets.all += n;
    if (row.status in facets) facets[row.status] = n;
    if ((OPEN_INVOICE_STATUSES as readonly string[]).includes(row.status)) {
      facets.open += n;
    }
  }

  const items = rows.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    balanceDue: round2(
      inv.amount - inv.payments.reduce((s, p) => s + p.amount, 0)
    ),
    dueDate: inv.dueDate,
    sentAt: inv.sentAt,
    estimateId: inv.estimateId,
    customerName: inv.estimate.siteMeasure.location?.customer?.name ?? null,
  }));

  return { items, total, facets };
}
```

Note: `location` may be a nullable relation on `SiteMeasure` — the optional chaining handles both. If `tsc` says `location` is non-nullable, keep the optional chaining anyway (harmless) but drop `?.` only if biome flags it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/repositories/invoiceRepoList.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add components/invoices/filterInvoices.ts lib/repositories/invoiceRepo.ts __tests__/repositories/invoiceRepoList.test.ts
git commit -m "feat(invoices): add org-wide listInvoices repo query"
```

---

### Task 2: `GET /api/invoices` route handler

**Files:**
- Create: `app/api/invoices/route.ts` (the `app/api/invoices/` folder exists with only `[id]/` inside)
- Test: `__tests__/api/invoices.test.ts`

- [ ] **Step 1: Write the failing API test**

Create `__tests__/api/invoices.test.ts` (clone of `__tests__/api/estimates.test.ts` GET block):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, noParams } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listInvoices: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    facets: {
      all: 0,
      open: 0,
      draft: 0,
      sent: 0,
      viewed: 0,
      partial: 0,
      paid: 0,
      void: 0,
    },
  }),
}));

const stubSession = { user: { id: "u1", orgId: "org1", role: "lead" } };

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  requireSession: vi.fn().mockResolvedValue(stubSession as any),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { listInvoices } = await import("@/lib/repositories");
const { requireSession } = await import("@/lib/tenant");
const { GET } = await import("@/app/api/invoices/route");

const mockList = vi.mocked(listInvoices);
const mockRequireSession = vi.mocked(requireSession);

beforeEach(() => {
  vi.clearAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockRequireSession.mockResolvedValue(stubSession as any);
});

describe("GET /api/invoices", () => {
  it("401 for crew role", async () => {
    mockRequireSession.mockResolvedValue({
      user: { id: "u1", orgId: "org1", role: "crew" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any);
    const res = await GET(makeRequest("GET", "http://x/api/invoices"), noParams);
    expect(res.status).toBe(401);
  });

  it("defaults to status=open and sentAt desc", async () => {
    const res = await GET(makeRequest("GET", "http://x/api/invoices"), noParams);
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 1,
        status: "open",
        sort: { key: "sentAt", direction: "desc" },
        q: "",
      })
    );
  });

  it("passes parsed params and returns the paginated envelope", async () => {
    mockList.mockResolvedValue({
      items: [
        {
          id: 1,
          invoiceNumber: 9001,
          status: "partial",
          amount: 1000,
          balanceDue: 400,
          dueDate: null,
          sentAt: new Date("2026-06-01T00:00:00Z"),
          estimateId: 5,
          customerName: "Dana Floors",
        },
      ],
      total: 1,
      facets: {
        all: 1,
        open: 1,
        draft: 0,
        sent: 0,
        viewed: 0,
        partial: 1,
        paid: 0,
        void: 0,
      },
    });
    const res = await GET(
      makeRequest(
        "GET",
        "http://x/api/invoices?page=2&perPage=50&status=paid&sort=amount&dir=asc&q=dana"
      ),
      noParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.facets.open).toBe(1);
    expect(body.items[0].balanceDue).toBe(400);
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 2,
        perPage: 50,
        status: "paid",
        sort: { key: "amount", direction: "asc" },
        q: "dana",
      })
    );
  });

  it("falls back to status=open for an unknown status value", async () => {
    await GET(
      makeRequest("GET", "http://x/api/invoices?status=bogus"),
      noParams
    );
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ status: "open" })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/api/invoices.test.ts`
Expected: FAIL — cannot resolve `@/app/api/invoices/route` (and the repositories mock is missing `listInvoices` until Task 1 is merged — Task 1 must land first).

- [ ] **Step 3: Implement the route**

Create `app/api/invoices/route.ts` (clone of the GET half of `app/api/estimates/route.ts`):

```ts
import type { InvoiceStatusFilter } from "@/components/invoices/filterInvoices";
import { apiRoute } from "@/lib/api/route";
import { parsePageParams } from "@/lib/pagination/params";
import { type InvoiceSortKey, listInvoices } from "@/lib/repositories";

const INVOICE_SORT_KEYS = [
  "number",
  "customer",
  "amount",
  "dueDate",
  "sentAt",
] as const satisfies readonly InvoiceSortKey[];

const INVOICE_STATUS_FILTERS = [
  "all",
  "open",
  "draft",
  "paid",
  "void",
] as const satisfies readonly InvoiceStatusFilter[];

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: INVOICE_SORT_KEYS,
    defaultSort: { key: "sentAt", direction: "desc" },
  });
  const statusParam = req.nextUrl.searchParams.get("status");
  const status: InvoiceStatusFilter =
    statusParam &&
    (INVOICE_STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as InvoiceStatusFilter)
      : "open";

  return listInvoices(orgId, { page, perPage, sort, q, status });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/api/invoices.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add app/api/invoices/route.ts __tests__/api/invoices.test.ts
git commit -m "feat(invoices): add GET /api/invoices org-wide list endpoint"
```

---

### Task 3: `useInvoiceList` hook + list invalidation in mutations

**Files:**
- Modify: `lib/hooks/useInvoices.ts`

No new unit test — the hook is exercised by the Task 4 component test, and existing hook tests in this repo follow the same pattern (no direct tests for `useEstimates` either).

- [ ] **Step 1: Add the list types, query-string helper, and hook**

In `lib/hooks/useInvoices.ts`, change the react-query import to include `keepPreviousData`:

```ts
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
```

Add below the existing imports:

```ts
import type { InvoiceStatusFilter } from "@/components/invoices/filterInvoices";
import type { SortDirection } from "@/lib/sort";
```

Add after the `InvoiceListItem` interface:

```ts
/** Row in the org-wide invoices list (dates serialized as ISO strings). */
export interface InvoiceListRow {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  balanceDue: number;
  dueDate: string | null;
  sentAt: string | null;
  estimateId: number;
  customerName: string | null;
}

export interface InvoiceListParams {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  q: string;
  status: InvoiceStatusFilter;
}

export interface InvoiceListResponse {
  items: InvoiceListRow[];
  total: number;
  facets: Record<string, number>;
}

/**
 * Unlike the estimates query string, status is always sent: the API
 * defaults a missing status to "open", not "all".
 */
function invoiceListQueryString(p: InvoiceListParams): string {
  const sp = new URLSearchParams();
  sp.set("page", String(p.page));
  sp.set("perPage", String(p.perPage));
  sp.set("sort", p.sort);
  sp.set("dir", p.dir);
  sp.set("status", p.status);
  if (p.q) sp.set("q", p.q);
  return sp.toString();
}
```

Add after the existing `useInvoices` function:

```ts
export function useInvoiceList(params: InvoiceListParams) {
  return useQuery({
    queryKey: ["invoices", "list", params],
    queryFn: async () =>
      jsonOrThrow<InvoiceListResponse>(
        await fetch(`/api/invoices?${invoiceListQueryString(params)}`),
        "Failed to load invoices"
      ),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: Invalidate the list from every invoice mutation**

In the same file, add this line to the `onSuccess` of **all four** mutation hooks — `useCreateInvoice`, `useSendInvoice`, `useRecordPayment`, `useVoidInvoice` — alongside their existing invalidations:

```ts
      qc.invalidateQueries({ queryKey: ["invoices", "list"] });
```

(Each `onSuccess` ends up with three `invalidateQueries` calls, except `useCreateInvoice`, which gets `["invoices", "list"]` added to its existing two.)

- [ ] **Step 3: Typecheck, lint, run the invoice test suites, commit**

```bash
npm run typecheck
npm run lint:ci
npx vitest run __tests__/components/invoices
git add lib/hooks/useInvoices.ts
git commit -m "feat(invoices): add useInvoiceList hook and list invalidation"
```

Expected: existing invoice component tests still pass.

---

### Task 4: `InvoiceListView` component + component test

**Files:**
- Create: `components/invoices/InvoiceList.tsx`
- Test: `__tests__/components/invoices/InvoiceList.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `__tests__/components/invoices/InvoiceList.test.tsx` (conventions from `__tests__/components/invoices/InvoicesSection.test.tsx`):

```tsx
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceListView } from "@/components/invoices/InvoiceList";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const listBody = {
  items: [
    {
      id: 1,
      invoiceNumber: 9001,
      status: "partial",
      amount: 4000,
      balanceDue: 3000,
      dueDate: "2026-05-01T00:00:00.000Z",
      sentAt: "2026-04-20T00:00:00.000Z",
      estimateId: 5,
      customerName: "Dana Floors",
    },
  ],
  total: 1,
  facets: {
    all: 4,
    open: 1,
    draft: 1,
    sent: 0,
    viewed: 0,
    partial: 1,
    paid: 1,
    void: 1,
  },
};

let lastUrl = "";

beforeEach(() => {
  lastUrl = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      lastUrl = String(url);
      return new Response(JSON.stringify(listBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvoiceListView", () => {
  it("defaults to the open filter and renders rows with balance due", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    expect(lastUrl).toContain("status=open");
    expect(screen.getByText("Dana Floors")).toBeDefined();
    // balanceDue 3000 rendered via fmtDollar
    expect(screen.getAllByText(/\$3000/).length).toBeGreaterThan(0);
  });

  it("switches the status filter via pills", async () => {
    render(wrap(<InvoiceListView />));
    await waitFor(() => expect(screen.getByText("#9001")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Paid/ }));
    await waitFor(() => expect(lastUrl).toContain("status=paid"));
  });

  it("shows the open-specific empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...listBody,
              items: [],
              total: 0,
              facets: { ...listBody.facets, open: 0 },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );
    render(wrap(<InvoiceListView />));
    await waitFor(() =>
      expect(screen.getByText(/No open invoices/)).toBeDefined()
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/invoices/InvoiceList.test.tsx`
Expected: FAIL — `InvoiceListView` does not exist.

- [ ] **Step 3: Implement the component**

Create `components/invoices/InvoiceList.tsx`. This is a clone of `components/estimates/EstimateList.tsx` with invoice columns; reuse its exact class strings and structure. Full source:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InvoiceStatusFilter } from "@/components/invoices/filterInvoices";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { type InvoiceListRow, useInvoiceList } from "@/lib/hooks/useInvoices";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";
import { fmtDollar } from "@/lib/utils";

const STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const STATUS_PILL_COLOR: Record<string, string> = {
  draft: "text-[var(--muted)]",
  sent: "text-[var(--gold)]",
  viewed: "text-[var(--gold)]",
  partial: "text-[var(--gold)]",
  paid: "text-[var(--sage)]",
  void: "text-[var(--accent)]",
};

const OPEN_SET = new Set(["sent", "viewed", "partial"]);

type SortKey = "number" | "customer" | "amount" | "dueDate" | "sentAt";

function isOverdue(row: InvoiceListRow): boolean {
  return (
    OPEN_SET.has(row.status) &&
    row.dueDate !== null &&
    new Date(row.dueDate).getTime() < Date.now()
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InvoiceListView() {
  const router = useRouter();
  const [query, setQueryState] = useState<string>("");
  const [status, setStatusState] = useState<InvoiceStatusFilter>("open");

  const {
    sort,
    page,
    perPage,
    density,
    setSort,
    setPage,
    setPerPage,
    setDensity,
  } = useTableQueryState<SortKey>({
    storageKey: "invoices",
    validSortKeys: ["number", "customer", "amount", "dueDate", "sentAt"],
    defaultSort: { key: "sentAt", direction: "desc" },
  });

  const setQuery = (v: string) => {
    setQueryState(v);
    setPage(1);
  };
  const setStatus = (v: InvoiceStatusFilter) => {
    setStatusState(v);
    setPage(1);
  };

  const debouncedQuery = useDebouncedValue(query, 300);
  const sortKey = sort?.key ?? "sentAt";
  const sortDir = sort?.direction ?? "desc";
  const { data, isLoading } = useInvoiceList({
    page,
    perPage,
    sort: sortKey,
    dir: sortDir,
    q: debouncedQuery,
    status,
  });
  const invoices = data?.items ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? {};
  const statusCounts = {
    all: facets.all ?? 0,
    open: facets.open ?? 0,
    draft: facets.draft ?? 0,
    paid: facets.paid ?? 0,
    void: facets.void ?? 0,
  } as Record<InvoiceStatusFilter, number>;

  const handleSort = (key: SortKey) => {
    const defaultDir = key === "customer" ? "asc" : "desc";
    setSort(cycleSort(sort, key, defaultDir));
  };

  const allCount = facets.all ?? 0;
  const isNarrowed = total !== allCount;
  const rowPad = ROW_PADDING[density];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Invoices
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2 tabular-nums">
            {allCount} invoice{allCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search invoice #, customer…"
        />
        {STATUS_FILTERS.map(({ value, label }) => (
          <FilterPill
            key={value}
            active={status === value}
            count={statusCounts[value]}
            onClick={() => setStatus(value)}
          >
            {label}
          </FilterPill>
        ))}
        <DensityToggle
          value={density}
          onChange={setDensity}
          className="ml-auto"
        />
        {isNarrowed && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tabular-nums">
            {total} of {allCount}
          </span>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        <div className="hidden md:grid grid-cols-[80px_1fr_110px_110px_100px_105px_105px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          <SortableHeader
            sortKey="number"
            label="#"
            sort={sort}
            onSort={handleSort}
            className="tabular-nums"
          />
          <SortableHeader
            sortKey="customer"
            label="Customer"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="amount"
            label="Amount"
            sort={sort}
            onSort={handleSort}
            className="tabular-nums"
          />
          <div className="px-3.5 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
            Balance due
          </div>
          <div className="px-3.5 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
            Status
          </div>
          <SortableHeader
            sortKey="dueDate"
            label="Due"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="sentAt"
            label="Sent"
            sort={sort}
            onSort={handleSort}
          />
        </div>

        {isLoading ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : allCount === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No invoices yet.
          </div>
        ) : total === 0 ? (
          status === "open" && !query ? (
            <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              No open invoices — everything sent has been paid.
            </div>
          ) : (
            <EmptyState noun="invoice" query={query} />
          )
        ) : (
          <>
            {invoices.map((row) => {
              const pillColor =
                STATUS_PILL_COLOR[row.status] ?? "text-[var(--muted)]";
              const overdue = isOverdue(row);

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => router.push(`/invoices/${row.id}`)}
                  className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_110px_110px_100px_105px_105px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
                >
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <span className="font-[var(--font-mono)] text-[13px] font-[600] tabular-nums">
                      #{row.invoiceNumber}
                    </span>
                  </div>
                  <div className={cn("px-3.5", rowPad)}>
                    <div className="text-[14px] font-[600] tracking-[-0.01em]">
                      {row.customerName ?? "—"}
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap md:hidden">
                      #{row.invoiceNumber} · {fmtDollar(row.balanceDue)} due ·{" "}
                      <span className={pillColor}>{row.status}</span>
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="text-[13px] font-[600] tabular-nums">
                      {fmtDollar(row.amount)}
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="text-[13px] tabular-nums">
                      {fmtDollar(row.balanceDue)}
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <span
                      className={cn(
                        "inline-block font-[var(--font-mono)] text-[9px] px-2 py-[3px] border rounded-[4px] tracking-[.04em] font-[500] capitalize",
                        pillColor,
                        "border-current"
                      )}
                    >
                      {row.status}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px]",
                      overdue ? "text-[var(--accent)]" : "text-[var(--muted)]",
                      rowPad
                    )}
                  >
                    {fmtDate(row.dueDate)}
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]",
                      rowPad
                    )}
                  >
                    {fmtDate(row.sentAt)}
                  </div>
                </button>
              );
            })}
            <Pagination
              total={total}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              noun="invoice"
            />
          </>
        )}
      </div>
    </>
  );
}
```

Implementation notes for the executor:
- Check `SortableHeader`'s props in `components/ui/SortableHeader.tsx` before writing the two non-sortable headers ("Balance due", "Status") — copy the *exact* header-cell classes `SortableHeader` renders for its label so the row of headers looks uniform. The class string above is a best guess; match the real one.
- `fmtDollar` lives in `lib/utils.ts` and is what the invoice components already use for money.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/invoices/InvoiceList.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add components/invoices/InvoiceList.tsx __tests__/components/invoices/InvoiceList.test.tsx
git commit -m "feat(invoices): add org-wide InvoiceListView component"
```

---

### Task 5: `/invoices` page + nav tab

**Files:**
- Create: `app/(app)/invoices/page.tsx`
- Modify: `components/ui/AppNav.tsx` (NAV_TABS at line ~11, NavIcon icons map at line ~198)

Note: `app/(app)/invoices/[id]/` may already exist for the invoice detail page — creating `page.tsx` at the group root is additive either way.

- [ ] **Step 1: Create the page**

Create `app/(app)/invoices/page.tsx` (clone of `app/(app)/estimates/page.tsx`):

```tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InvoiceListView } from "@/components/invoices/InvoiceList";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Invoices — SqFt" };

export default async function InvoicesPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return (
    <Suspense fallback={null}>
      <InvoiceListView />
    </Suspense>
  );
}
```

- [ ] **Step 2: Add the nav tab and icon**

In `components/ui/AppNav.tsx`, insert into `NAV_TABS` directly after the Estimates entry:

```ts
  { href: "/invoices", label: "Invoices", screen: "invoice-list" },
```

In the `NavIcon` `icons` map, add an `Invoices` entry (a receipt: zig-zag bottom edge + lines):

```tsx
    Invoices: (
      <svg {...props}>
        <title>{label}</title>
        <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    ),
```

The existing `navTabsFor(role)` already hides everything except My Schedule from crew, so no gating change is needed.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint:ci
npm test
```

Expected: all pass. (No dedicated page unit test — the page wrapper matches the estimates page, which also has none; the e2e in Task 6 covers it.)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/invoices/page.tsx" components/ui/AppNav.tsx
git commit -m "feat(invoices): add /invoices page and nav tab"
```

---

### Task 6: Playwright e2e

**Files:**
- Create: `tests/e2e/invoices-list.spec.ts`

Uses existing fixtures: `loginAsWorkerOrg` (`tests/e2e/fixtures/org.ts`), `createCustomerAndEstimate`, `seedEstimateWithLineItem`, `seedInvoice` (`tests/e2e/fixtures/seed.ts`). `seedInvoice(request, estimateId, { amount })` POSTs to the per-estimate create endpoint and returns `{ invoiceId }`. A draft invoice becomes "sent" via `POST /api/invoices/[id]/send` — check `tests/e2e/invoice-send.spec.ts` for the exact request body if the send call below 400s.

- [ ] **Step 1: Write the e2e spec**

Create `tests/e2e/invoices-list.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe
  .serial("Invoices list page", () => {
    let ctx: BrowserContext;
    let sentInvoiceNumber: number;
    let draftInvoiceNumber: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
      const { estimateId } = await seedEstimateWithLineItem(
        ctx.request,
        siteMeasureId
      );
      // give the line item quantity so the estimate has a non-zero total
      const est = await (
        await ctx.request.get(`/api/estimates/${estimateId}`)
      ).json();
      const li = est.lineItems[0];
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...li, qty: 100 }] },
      });

      // one OPEN invoice (sent) and one DRAFT invoice
      const sent = await seedInvoice(ctx.request, estimateId, { amount: 100 });
      const sendRes = await ctx.request.post(
        `/api/invoices/${sent.invoiceId}/send`,
        { data: { to: "customer@example.com", subject: "Invoice" } }
      );
      expect(sendRes.ok()).toBe(true);
      const draft = await seedInvoice(ctx.request, estimateId, { amount: 50 });

      sentInvoiceNumber = (
        await (await ctx.request.get(`/api/invoices/${sent.invoiceId}`)).json()
      ).invoiceNumber;
      draftInvoiceNumber = (
        await (
          await ctx.request.get(`/api/invoices/${draft.invoiceId}`)
        ).json()
      ).invoiceNumber;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("Invoices nav tab opens the list defaulting to Open", async () => {
      const page = await ctx.newPage();
      await page.goto("/estimates");
      await page.getByRole("link", { name: "Invoices" }).first().click();
      await expect(page).toHaveURL(/\/invoices$/);

      // the sent invoice is visible under the default Open filter…
      await expect(
        page
          .locator("button")
          .filter({ hasText: `#${sentInvoiceNumber}` })
          .first()
      ).toBeVisible();
      // …and the draft one is not
      await expect(
        page.locator("button").filter({ hasText: `#${draftInvoiceNumber}` })
      ).toHaveCount(0);
      await page.close();
    });

    test("Draft pill reveals the draft invoice", async () => {
      const page = await ctx.newPage();
      await page.goto("/invoices");
      await page.getByRole("button", { name: /^Draft/ }).click();
      await expect(
        page
          .locator("button")
          .filter({ hasText: `#${draftInvoiceNumber}` })
          .first()
      ).toBeVisible();
      await page.close();
    });

    test("clicking a row opens the invoice detail", async () => {
      const page = await ctx.newPage();
      await page.goto("/invoices");
      await page
        .locator("button")
        .filter({ hasText: `#${sentInvoiceNumber}` })
        .first()
        .click();
      await expect(page).toHaveURL(/\/invoices\/\d+/);
      await page.close();
    });
  });
```

Note: the `FilterPill` rendering may include the facet count in the accessible name (e.g. "Draft 1") — the regex `/^Draft/` handles that. If the pill role differs, check how `tests/e2e/estimates-list.spec.ts` interacts with pills and copy it.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/invoices-list.spec.ts --workers=1`
Expected: 3 tests pass. (Requires the dev DB seeded/migrated: `npm run migrate:dev && npm run seed:dev` if the environment is fresh.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/invoices-list.spec.ts
git commit -m "test(e2e): invoices list page coverage"
```

---

### Task 7: Docs sync + full verification

**Files:**
- Modify: `CONTEXT.md` (invoice section)
- Modify: `AGENTS.md` (route-group list in "Where things live")

- [ ] **Step 1: Update CONTEXT.md**

In the invoice section of `CONTEXT.md` (≈ lines 155–200), add a short paragraph after the lifecycle description:

```markdown
**Org-wide list.** `GET /api/invoices` (lead+) lists all org invoices —
`listInvoices` in `lib/repositories/invoiceRepo.ts` — with pagination, search
(customer name / invoice #), sort, and a `status` filter of
`all | open | draft | paid | void`, defaulting to **`open`**, the status
group `sent + viewed + partial` ("sent but not fully paid"). The group is
defined once as `OPEN_INVOICE_STATUSES` in
`components/invoices/filterInvoices.ts`. Each row carries a computed
`balanceDue` (amount − recorded payments). Facet counts are org-wide and
ignore the active filter/search.
```

Adjust placement to fit the section's existing flow — edit the affected section, don't just append to the file.

- [ ] **Step 2: Update AGENTS.md**

In the `app/(app)/` bullet of "Where things live", the route-group list `(customers, estimates, invoices, …)` — verify `invoices` is present in that parenthetical (it already is); add a clause noting the org-wide list page alongside the existing My Schedule sentence, e.g. extend the bullet with:

```markdown
  The org-wide **Invoices** list (`app/(app)/invoices`,
  `components/invoices/InvoiceList`) defaults to the "Open" filter
  (sent + viewed + partial) and is lead+ only.
```

- [ ] **Step 3: Full verification (Before Finishing Work checklist)**

```bash
npm run lint:ci
npm run typecheck
npm test
npm run test:e2e -- --workers=1
```

Expected: all pass. Schema unchanged → no seed-script update required.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md AGENTS.md
git commit -m "docs: org-wide invoices list in CONTEXT/AGENTS"
```
