import type { Prisma } from "@/app/generated/prisma/client";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import { assertDeletable } from "@/lib/repositories/deleteGuards";
import { buildSearchWhere } from "@/lib/repositories/search";
import type { SortDirection } from "@/lib/sort";
import type { RoomSegment } from "@/lib/utils";

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
  "id" | "siteMeasureId" | "segments"
> & {
  id?: number;
  segments?: RoomSegment[] | null;
};

/** Canonicalize a room's dimensions at the write boundary so the DB never
 *  holds two competing sources of truth: a single box is stored as the legacy
 *  scalar w/l (segments NULL — old readers and rollbacks keep working), and
 *  only a genuine multi-box room stores `segments` (scalars NULL). */
export function canonicalizeRoomDims(
  item: Omit<SiteMeasureItemInput, "id">
): Omit<SiteMeasureItemInput, "id"> {
  if (item.type !== "room" || item.segments == null) return item;
  if (item.segments.length <= 1) {
    const box = item.segments[0];
    return {
      ...item,
      w: box?.w ?? null,
      l: box?.l ?? null,
      segments: null,
    };
  }
  return { ...item, w: null, l: null };
}

export type SiteMeasurePatch = {
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
  return buildSearchWhere<Prisma.SiteMeasureWhereInput>(q, {
    customerName: (cleaned) => ({
      location: {
        customer: { name: { contains: cleaned, mode: "insensitive" } },
      },
    }),
    number: (n) => ({ siteMeasureNumber: n }),
  });
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

    // Atomically reserve the next number. The increment-returning update locks
    // the Organization row, so concurrent creates can't allocate the same
    // number (a plain findUnique read does not lock under READ COMMITTED).
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextSiteMeasureNumber: { increment: 1 } },
      select: { nextSiteMeasureNumber: true },
    });
    const siteMeasureNumber = org.nextSiteMeasureNumber - 1;
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
          data: items.map(({ id: _id, ...item }) => {
            const { segments, ...rest } = canonicalizeRoomDims(item);
            return {
              ...rest,
              siteMeasureId: id,
              segments:
                segments == null
                  ? undefined
                  : (segments as unknown as Prisma.InputJsonValue),
            };
          }),
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

export interface SiteMeasureCreationCounts {
  total: number;
  thisWeek: number;
  lastWeek: number;
}

/** Site-measure creation counts for the dashboard's site-measures KPI. */
export async function getSiteMeasureCreationCounts(
  orgId: string,
  weekAgo: Date,
  twoWeeksAgo: Date
): Promise<SiteMeasureCreationCounts> {
  const [total, thisWeek, lastWeek] = await Promise.all([
    prisma.siteMeasure.count({ where: { orgId } }),
    prisma.siteMeasure.count({
      where: { orgId, createdAt: { gte: weekAgo } },
    }),
    prisma.siteMeasure.count({
      where: { orgId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
    }),
  ]);
  return { total, thisWeek, lastWeek };
}

/**
 * Delete a site measure. The cascade reaches every descendant estimate (and
 * Estimate→Invoice→Payment is also Cascade), so this refuses — like
 * deleteEstimate — while a descendant estimate has scheduled Events or any
 * invoice. Otherwise deleting a site measure would bypass the guards that
 * deleting the estimate itself enforces.
 */
export async function deleteSiteMeasure(
  id: number,
  orgId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await assertDeletable(tx, orgId, { estimate: { siteMeasureId: id } });
    const result = await tx.siteMeasure.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}
