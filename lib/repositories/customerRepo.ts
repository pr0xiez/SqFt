import { Prisma } from "@/app/generated/prisma/client";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import { assertDeletable } from "@/lib/repositories/deleteGuards";
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

/** Org/search-scoped aggregate; reused by the materialized page/facet query. */
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

function sourceSql(source: string): Prisma.Sql {
  return source === "all" ? Prisma.sql`TRUE` : Prisma.sql`a.source = ${source}`;
}

function pipelineSql(pipeline: CustomerPipelineFilter): Prisma.Sql {
  switch (pipeline) {
    case "open":
      return Prisma.sql`a.open_count > 0`;
    case "accepted":
      return Prisma.sql`a.accepted_count > 0`;
    case "cold":
      return Prisma.sql`a.estimate_count = 0`;
    default:
      return Prisma.sql`TRUE`;
  }
}

const SORT_COLUMN: Record<CustomerSortKey, Prisma.Sql> = {
  name: Prisma.sql`name`,
  source: Prisma.sql`source`,
  siteMeasures: Prisma.sql`site_measure_count`,
  open: Prisma.sql`open_count`,
  createdAt: Prisma.sql`"createdAt"`,
};

type CustomerPageAggregate = {
  ids: number[];
  total: number;
  facets: Record<string, number>;
  summary: CustomerListResult["summary"];
};

export async function listCustomers(
  orgId: string,
  params: ListCustomersParams
): Promise<CustomerListResult> {
  const { page, perPage, sort, q, source, pipeline } = params;
  const direction =
    sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  // Materialize the expensive join once. Postgres retains its native collation
  // and pages before returning ids; counts/facets/summary reuse the same base.
  const [aggregate] = await prisma.$queryRaw<
    CustomerPageAggregate[]
  >(Prisma.sql`
    WITH base AS MATERIALIZED (${aggregateBase(orgId, q)}),
    filtered AS (SELECT a.* FROM base a WHERE ${sourceSql(source)} AND ${pipelineSql(pipeline)}),
    page_rows AS (
      SELECT id FROM filtered
      ORDER BY ${SORT_COLUMN[sort.key]} ${direction}, id ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    ),
    source_facets AS (
      SELECT source, COUNT(*)::int AS count FROM base a
      WHERE ${pipelineSql(pipeline)} GROUP BY source
    ),
    pipeline_facets AS (
      SELECT 'any' AS key, COUNT(*)::int AS count FROM base a WHERE ${sourceSql(source)}
      UNION ALL SELECT 'open', COUNT(*)::int FROM base a WHERE ${sourceSql(source)} AND open_count > 0
      UNION ALL SELECT 'accepted', COUNT(*)::int FROM base a WHERE ${sourceSql(source)} AND accepted_count > 0
      UNION ALL SELECT 'cold', COUNT(*)::int FROM base a WHERE ${sourceSql(source)} AND estimate_count = 0
    )
    SELECT ARRAY(SELECT id FROM page_rows) AS ids,
      (SELECT COUNT(*)::int FROM filtered) AS total,
      COALESCE((SELECT jsonb_object_agg('source:' || source, count) FROM source_facets), '{}'::jsonb)
        || jsonb_build_object('source:all', (SELECT COALESCE(SUM(count), 0)::int FROM source_facets))
        || COALESCE((SELECT jsonb_object_agg('pipeline:' || key, count) FROM pipeline_facets WHERE count > 0), '{}'::jsonb) AS facets,
      (SELECT jsonb_build_object(
        'openEstimates', COALESCE(SUM(open_count), 0)::int,
        'won', COALESCE(SUM(accepted_count), 0)::int,
        'withOpen', COUNT(*) FILTER (WHERE open_count > 0)::int
      ) FROM filtered) AS summary
  `);

  const hydrated = aggregate.ids.length
    ? await prisma.customer.findMany({
        where: { orgId, id: { in: aggregate.ids } },
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
  const byId = new Map(hydrated.map((customer) => [customer.id, customer]));
  const items = aggregate.ids.flatMap((id) => {
    const customer = byId.get(id);
    return customer ? [customer] : [];
  });
  return {
    items,
    total: aggregate.total,
    facets: aggregate.facets,
    summary: aggregate.summary,
  };
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

/** Best-effort email sync (e.g. from a send dialog). Returns whether a row
 *  actually matched — callers decide how to surface a miss/throw. */
export async function updateCustomerEmail(
  id: number,
  orgId: string,
  email: string
): Promise<boolean> {
  const result = await prisma.customer.updateMany({
    where: { id, orgId },
    data: { email },
  });
  return result.count > 0;
}

/**
 * Delete a customer. The cascade reaches every descendant estimate via
 * Location→SiteMeasure→Estimate (and Estimate→Invoice→Payment is also
 * Cascade), so this refuses — like deleteEstimate — while a descendant
 * estimate has scheduled Events or any invoice. Otherwise deleting the
 * customer would bypass the guards that deleting the estimate itself enforces.
 * Events can also link to a Customer directly (nullable `customerId`, used by
 * non-`job` events with no estimate chain), so the Event guard checks both
 * paths — otherwise Prisma's `SetNull` FK action would silently orphan a live
 * scheduled event instead of blocking the delete.
 */
export async function deleteCustomer(
  id: number,
  orgId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const descendantEstimates = {
      estimate: { siteMeasure: { location: { customerId: id } } },
    };
    await assertDeletable(tx, orgId, descendantEstimates, {
      OR: [{ customerId: id }, descendantEstimates],
    });
    const result = await tx.customer.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}
