import type { Prisma } from "@/app/generated/prisma/client";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import { searchableInt } from "@/lib/repositories/search";
import type { SortDirection } from "@/lib/sort";

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

export type SiteMeasureWithCustomerAndCount = Prisma.SiteMeasureGetPayload<{
  include: typeof SITE_MEASURE_LIST_INCLUDE;
}>;

export type SiteMeasureWithDetails = Prisma.SiteMeasureGetPayload<{
  include: {
    location: { include: { customer: true } };
    items: { orderBy: { sortOrder: "asc" } };
    estimates: {
      orderBy: { createdAt: "desc" };
      select: {
        id: true;
        estimateNumber: true;
        status: true;
        date: true;
        createdAt: true;
        _count: { select: { lineItems: true } };
      };
    };
  };
}>;

type SiteMeasureItemInput = Omit<
  Prisma.SiteMeasureItemUncheckedCreateInput,
  "id" | "siteMeasureId"
> & {
  id?: number;
};

export type SiteMeasurePatch = {
  title?: string;
  locationId?: number;
  items?: SiteMeasureItemInput[];
};

export type SiteMeasureSortKey = "id" | "customer" | "date";
export type SiteMeasureStatusFilter =
  | "all"
  | "empty"
  | "measured"
  | "estimated";

export interface ListSiteMeasuresParams {
  page: number;
  perPage: number;
  sort: { key: SiteMeasureSortKey; direction: SortDirection };
  q: string;
  status: SiteMeasureStatusFilter;
}

/** Existence-filter bucket for a site-measure status. A "room" is a
 *  SiteMeasureItem with type "room"; "measured" means at least one room but no
 *  estimates, "estimated" means rooms + at least one estimate. */
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
  if (sort.key === "customer") return { location: { customer: { name: dir } } };
  return { date: dir };
}

function siteMeasureSearchWhere(
  q: string
): Prisma.SiteMeasureWhereInput | null {
  const cleaned = q.trim().replace(/^#/, "");
  if (cleaned.length === 0) return null;
  const or: Prisma.SiteMeasureWhereInput[] = [
    {
      location: {
        customer: { name: { contains: cleaned, mode: "insensitive" } },
      },
    },
  ];
  const n = searchableInt(cleaned);
  if (n !== null) or.push({ siteMeasureNumber: n });
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

  const facetWhere = (
    status: SiteMeasureStatusFilter
  ): Prisma.SiteMeasureWhereInput => ({
    orgId,
    ...siteMeasureStatusWhere(status),
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

export async function getSiteMeasure(
  id: number,
  orgId: string
): Promise<SiteMeasureWithDetails | null> {
  return prisma.siteMeasure.findFirst({
    where: { id, orgId },
    include: {
      location: { include: { customer: true } },
      items: { orderBy: { sortOrder: "asc" } },
      estimates: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          estimateNumber: true,
          status: true,
          date: true,
          createdAt: true,
          _count: { select: { lineItems: true } },
        },
      },
    },
  });
}

export async function createSiteMeasure(
  orgId: string,
  data: Omit<
    Prisma.SiteMeasureUncheckedCreateInput,
    "orgId" | "siteMeasureNumber"
  >
) {
  return prisma.$transaction(async (tx) => {
    // The location must belong to the caller's org — otherwise a site measure
    // could be attached to another tenant's location (mirrors createEstimate).
    const location = await tx.location.findFirst({
      where: { id: data.locationId, orgId },
      select: { id: true },
    });
    if (!location) return null;

    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { nextSiteMeasureNumber: true },
    });
    const siteMeasureNumber = org?.nextSiteMeasureNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextSiteMeasureNumber: siteMeasureNumber + 1 },
    });
    return tx.siteMeasure.create({
      data: { ...data, orgId, siteMeasureNumber },
    });
  });
}

export async function saveSiteMeasure(
  id: number,
  orgId: string,
  patch: SiteMeasurePatch
): Promise<SiteMeasureWithDetails | null> {
  const { items, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    // Re-pointing to a location must stay within the caller's org.
    if (topLevel.locationId !== undefined) {
      const location = await tx.location.findFirst({
        where: { id: topLevel.locationId, orgId },
        select: { id: true },
      });
      if (!location) return null;
    }

    if (Object.keys(topLevel).length > 0) {
      const result = await tx.siteMeasure.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.siteMeasure.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (items !== undefined) {
      await tx.siteMeasureItem.deleteMany({ where: { siteMeasureId: id } });
      if (items.length > 0) {
        await tx.siteMeasureItem.createMany({
          data: items.map(({ id: _id, ...item }) => ({
            ...item,
            siteMeasureId: id,
          })),
        });
      }
    }

    return tx.siteMeasure.findFirst({
      where: { id, orgId },
      include: {
        location: { include: { customer: true } },
        items: { orderBy: { sortOrder: "asc" } },
        estimates: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            estimateNumber: true,
            status: true,
            date: true,
            createdAt: true,
            _count: { select: { lineItems: true } },
          },
        },
      },
    });
  });
}

export async function deleteSiteMeasure(
  id: number,
  orgId: string
): Promise<boolean> {
  const result = await prisma.siteMeasure.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
