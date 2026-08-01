import { Prisma } from "@/app/generated/prisma/client";
import { EstimateHasEventsError, HasInvoicesError } from "@/lib/api/errors";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import type { SortDirection } from "@/lib/sort";

const LIST_ESTIMATE_SELECT = {
  status: true,
  sentAt: true,
  viewedAt: true,
  approvedAt: true,
  declinedAt: true,
  createdAt: true,
} as const;

const DETAIL_ESTIMATE_SELECT = {
  id: true,
  estimateNumber: true,
  status: true,
  date: true,
  sentAt: true,
  viewedAt: true,
  approvedAt: true,
  declinedAt: true,
  createdAt: true,
  _count: { select: { lineItems: true } },
} as const;

export type CustomerWithCount = Prisma.CustomerGetPayload<{
  include: {
    _count: { select: { locations: true } };
    locations: {
      select: {
        siteMeasures: {
          select: {
            estimates: { select: typeof LIST_ESTIMATE_SELECT };
          };
        };
      };
    };
  };
}>;

export type CustomerWithEstimates = Prisma.CustomerGetPayload<{
  include: {
    locations: {
      orderBy: { createdAt: "asc" };
      include: {
        siteMeasures: {
          orderBy: { createdAt: "desc" };
          include: {
            estimates: {
              orderBy: { createdAt: "desc" };
              select: typeof DETAIL_ESTIMATE_SELECT;
            };
          };
        };
      };
    };
    _count: { select: { locations: true } };
  };
}>;

export type CustomerCreate = Prisma.CustomerCreateInput extends {
  orgId: string;
}
  ? Omit<Prisma.CustomerUncheckedCreateInput, "orgId" | "id" | "createdAt">
  : never;

export type CustomerUpdate = Prisma.CustomerUncheckedUpdateInput;

export type CustomerSortKey =
  | "name"
  | "source"
  | "siteMeasures"
  | "open"
  | "createdAt";
export type CustomerPipelineFilter = "any" | "open" | "accepted" | "cold";
export interface ListCustomersParams {
  page: number;
  perPage: number;
  sort: { key: CustomerSortKey; direction: SortDirection };
  q: string;
  source: string;
  pipeline: CustomerPipelineFilter;
}
export type CustomerListResult = Paginated<CustomerWithCount> & {
  summary: { openEstimates: number; won: number; withOpen: number };
};

const OPEN_STATUSES = Prisma.sql`('sent','viewed')`;

function searchSql(q: string): Prisma.Sql {
  const cleaned = q.trim();
  if (cleaned.length === 0) return Prisma.sql`TRUE`;
  const like = `%${cleaned}%`;
  return Prisma.sql`(c."name" ILIKE ${like} OR c."phone" ILIKE ${like} OR c."email" ILIKE ${like})`;
}

type CustomerAggRow = {
  id: number;
  name: string;
  source: string;
  createdAt: Date;
  site_measure_count: number;
  open_count: number;
  accepted_count: number;
  estimate_count: number;
};

/**
 * The one expensive multi-table aggregation this module needs: per-customer
 * counts across Customer ⋈ Location ⋈ SiteMeasure ⋈ Estimate, scoped to the
 * org and the free-text search (`q`) only. `source` and `pipeline` are
 * deliberately *not* applied here in SQL — every downstream view (page rows,
 * total, both facet sets, and the summary rollup) filters/derives from this
 * single result set in JS (see `listCustomers`), so the join + GROUP BY runs
 * exactly once per request no matter how many of those views are needed, and
 * none of them can drift from what the others compute since they all read
 * the same rows.
 */
function aggregateBase(orgId: string, q: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      c.id,
      c."name",
      c."source",
      c."createdAt",
      COUNT(DISTINCT sm.id)::int AS site_measure_count,
      COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES})::int AS open_count,
      COUNT(e.id) FILTER (WHERE e."status" = 'approved')::int AS accepted_count,
      COUNT(e.id)::int AS estimate_count
    FROM "Customer" c
    LEFT JOIN "Location" loc ON loc."customerId" = c.id
    LEFT JOIN "SiteMeasure" sm ON sm."locationId" = loc.id
    LEFT JOIN "Estimate" e ON e."siteMeasureId" = sm.id
    WHERE c."orgId" = ${orgId} AND ${searchSql(q)}
    GROUP BY c.id
  `;
}

function matchesSource(row: CustomerAggRow, source: string): boolean {
  return source === "all" || row.source === source;
}

function matchesPipeline(
  row: CustomerAggRow,
  pipeline: CustomerPipelineFilter
): boolean {
  switch (pipeline) {
    case "open":
      return row.open_count > 0;
    case "accepted":
      return row.accepted_count > 0;
    case "cold":
      return row.estimate_count === 0;
    default:
      return true;
  }
}

const SORT_ACCESSOR: Record<
  CustomerSortKey,
  (r: CustomerAggRow) => number | string
> = {
  name: (r) => r.name,
  source: (r) => r.source,
  siteMeasures: (r) => r.site_measure_count,
  open: (r) => r.open_count,
  createdAt: (r) => r.createdAt.getTime(),
};

function compareRows(
  a: CustomerAggRow,
  b: CustomerAggRow,
  key: CustomerSortKey,
  direction: SortDirection
): number {
  const av = SORT_ACCESSOR[key](a);
  const bv = SORT_ACCESSOR[key](b);
  const primary =
    typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv)
      : (av as number) - (bv as number);
  if (primary !== 0) return direction === "asc" ? primary : -primary;
  return a.id - b.id; // stable tie-break, independent of sort direction
}

export async function listCustomers(
  orgId: string,
  params: ListCustomersParams
): Promise<CustomerListResult> {
  const { page, perPage, sort, q, source, pipeline } = params;
  const offset = (page - 1) * perPage;

  // The single, shared aggregation. Everything below derives from `agg`.
  const agg = await prisma.$queryRaw<CustomerAggRow[]>(aggregateBase(orgId, q));

  // Page rows / total / summary all respect every active filter, matching
  // what the customer previously saw applied via SQL WHERE + HAVING.
  const filtered = agg.filter(
    (r) => matchesSource(r, source) && matchesPipeline(r, pipeline)
  );
  // Facets relax exactly one filter at a time so each pill reports the count
  // it would produce if selected while the other filter stays applied.
  const sourceFacetCandidates = agg.filter((r) => matchesPipeline(r, pipeline));
  const pipelineFacetCandidates = agg.filter((r) => matchesSource(r, source));

  const sorted = [...filtered].sort((a, b) =>
    compareRows(a, b, sort.key, sort.direction)
  );
  const total = sorted.length;
  const ids = sorted.slice(offset, offset + perPage).map((r) => r.id);

  const facets: Record<string, number> = {};
  const sourceCounts = new Map<string, number>();
  for (const r of sourceFacetCandidates) {
    sourceCounts.set(r.source, (sourceCounts.get(r.source) ?? 0) + 1);
  }
  let sourceAll = 0;
  for (const [key, count] of sourceCounts) {
    facets[`source:${key}`] = count;
    sourceAll += count;
  }
  facets["source:all"] = sourceAll;

  const pipelineCounts: Record<string, number> = {
    any: pipelineFacetCandidates.length,
    open: pipelineFacetCandidates.filter((r) => r.open_count > 0).length,
    accepted: pipelineFacetCandidates.filter((r) => r.accepted_count > 0)
      .length,
    cold: pipelineFacetCandidates.filter((r) => r.estimate_count === 0).length,
  };
  for (const [key, count] of Object.entries(pipelineCounts)) {
    if (count > 0) facets[`pipeline:${key}`] = count;
  }

  // Fixes the drifted 5th copy: the summary now respects the same `q` and
  // `source` filters as the page rows / total / facets above (it's read
  // straight from `filtered`), instead of a hand-inlined join scoped only
  // to orgId.
  const summary = filtered.reduce(
    (acc, r) => {
      acc.openEstimates += r.open_count;
      acc.won += r.accepted_count;
      if (r.open_count > 0) acc.withOpen += 1;
      return acc;
    },
    { openEstimates: 0, won: 0, withOpen: 0 }
  );

  const hydrated = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids } },
        include: {
          _count: { select: { locations: true } },
          locations: {
            select: {
              siteMeasures: {
                select: { estimates: { select: LIST_ESTIMATE_SELECT } },
              },
            },
          },
        },
      })
    : [];
  const byId = new Map(hydrated.map((c) => [c.id, c]));
  const items = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as CustomerWithCount[];

  return { items, total, facets, summary };
}

export async function getCustomer(
  id: number,
  orgId: string
): Promise<CustomerWithEstimates | null> {
  return prisma.customer.findFirst({
    where: { id, orgId },
    include: {
      locations: {
        orderBy: { createdAt: "asc" },
        include: {
          siteMeasures: {
            orderBy: { createdAt: "desc" },
            include: {
              estimates: {
                orderBy: { createdAt: "desc" },
                select: DETAIL_ESTIMATE_SELECT,
              },
            },
          },
        },
      },
      _count: { select: { locations: true } },
    },
  });
}

export async function createCustomer(
  orgId: string,
  data: Omit<Prisma.CustomerUncheckedCreateInput, "orgId">
) {
  return prisma.customer.create({ data: { ...data, orgId } });
}

export async function updateCustomer(
  id: number,
  orgId: string,
  data: Prisma.CustomerUncheckedUpdateInput
) {
  const result = await prisma.customer.updateMany({
    where: { id, orgId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.customer.findFirst({ where: { id, orgId } });
}

/**
 * Delete a customer. The cascade reaches every descendant estimate via
 * Location→SiteMeasure→Estimate (and Estimate→Invoice→Payment is also
 * Cascade), so this refuses — like deleteEstimate — while a descendant
 * estimate has scheduled Events or any invoice. Otherwise deleting the
 * customer would bypass the guards that deleting the estimate itself enforces.
 */
export async function deleteCustomer(
  id: number,
  orgId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const descendantEstimates = {
      estimate: { siteMeasure: { location: { customerId: id } } },
    };
    const eventCount = await tx.event.count({
      where: { orgId, ...descendantEstimates },
    });
    if (eventCount > 0) throw new EstimateHasEventsError(eventCount);
    const invoiceCount = await tx.invoice.count({
      where: { orgId, ...descendantEstimates },
    });
    if (invoiceCount > 0) throw new HasInvoicesError(invoiceCount);
    const result = await tx.customer.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}
