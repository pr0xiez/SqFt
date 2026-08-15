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
const SORT_COLUMN: Record<CustomerSortKey, Prisma.Sql> = {
  name: Prisma.sql`c."name"`,
  source: Prisma.sql`c."source"`,
  siteMeasures: Prisma.sql`site_measure_count`,
  open: Prisma.sql`open_count`,
  createdAt: Prisma.sql`c."createdAt"`,
};

function searchSql(q: string): Prisma.Sql {
  const cleaned = q.trim();
  if (cleaned.length === 0) return Prisma.sql`TRUE`;
  const like = `%${cleaned}%`;
  return Prisma.sql`(c."name" ILIKE ${like} OR c."phone" ILIKE ${like} OR c."email" ILIKE ${like})`;
}

function sourceSql(source: string): Prisma.Sql {
  return source === "all"
    ? Prisma.sql`TRUE`
    : Prisma.sql`c."source" = ${source}`;
}

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
    WHERE c."orgId" = ${orgId} AND ${searchSql(q)} AND ${sourceSql(source)}
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
  const orderDir =
    sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const offset = (page - 1) * perPage;

  const pageRows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT c.id, COUNT(DISTINCT sm.id) AS site_measure_count, COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) AS open_count
    ${aggregateBase(orgId, q, source, pipeline)}
    ORDER BY ${orderCol} ${orderDir}, c.id ASC
    LIMIT ${perPage} OFFSET ${offset}
  `);
  const ids = pageRows.map((r) => r.id);

  const totalRows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM ( SELECT c.id ${aggregateBase(orgId, q, source, pipeline)} ) sub
  `);
  const total = Number(totalRows[0]?.count ?? 0);

  const sourceFacetRows = await prisma.$queryRaw<
    { key: string; count: bigint }[]
  >(Prisma.sql`
    SELECT key, COUNT(*)::bigint AS count FROM ( SELECT c."source" AS key ${aggregateBase(orgId, q, "all", pipeline)} ) sub GROUP BY key
  `);

  const pipelineFacetRows = await prisma.$queryRaw<
    { key: string; count: bigint }[]
  >(Prisma.sql`
    SELECT key, COUNT(*)::bigint AS count FROM (
      SELECT c.id,
        CASE WHEN COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) > 0 THEN 'open' END AS open_k,
        CASE WHEN COUNT(e.id) FILTER (WHERE e."status" = 'approved') > 0 THEN 'accepted' END AS acc_k,
        CASE WHEN COUNT(e.id) = 0 THEN 'cold' END AS cold_k
      ${aggregateBase(orgId, q, source, "any")}
    ) sub, LATERAL (VALUES ('any'), (open_k), (acc_k), (cold_k)) AS v(key)
    WHERE v.key IS NOT NULL GROUP BY v.key
  `);

  const summaryRows = await prisma.$queryRaw<
    { open: bigint; won: bigint; with_open: bigint }[]
  >(Prisma.sql`
    SELECT COALESCE(SUM(open_count), 0)::bigint AS open, COALESCE(SUM(accepted_count), 0)::bigint AS won, COUNT(*) FILTER (WHERE open_count > 0)::bigint AS with_open
    FROM (
      SELECT c.id, COUNT(e.id) FILTER (WHERE e."status" IN ${OPEN_STATUSES}) AS open_count, COUNT(e.id) FILTER (WHERE e."status" = 'approved') AS accepted_count
      FROM "Customer" c
      LEFT JOIN "Location" loc ON loc."customerId" = c.id
      LEFT JOIN "SiteMeasure" sm ON sm."locationId" = loc.id
      LEFT JOIN "Estimate" e ON e."siteMeasureId" = sm.id
      WHERE c."orgId" = ${orgId} GROUP BY c.id
    ) sub
  `);

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

  const facets: Record<string, number> = {};
  let sourceAll = 0;
  for (const r of sourceFacetRows) {
    const n = Number(r.count);
    facets[`source:${r.key}`] = n;
    sourceAll += n;
  }
  facets["source:all"] = sourceAll;
  for (const r of pipelineFacetRows) {
    facets[`pipeline:${r.key}`] = Number(r.count);
  }

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
    await assertDeletable(tx, orgId, {
      estimate: { siteMeasure: { location: { customerId: id } } },
    });
    const result = await tx.customer.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}
