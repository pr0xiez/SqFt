import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type SiteMeasureWithCustomerAndCount = Prisma.SiteMeasureGetPayload<{
  include: {
    location: {
      select: {
        id: true;
        address: true;
        label: true;
        customer: { select: { id: true; name: true } };
      };
    };
    _count: { select: { items: true; estimates: true } };
  };
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

export async function listSiteMeasures(
  orgId: string
): Promise<SiteMeasureWithCustomerAndCount[]> {
  return prisma.siteMeasure.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      location: {
        select: {
          id: true,
          address: true,
          label: true,
          customer: { select: { id: true, name: true } },
        },
      },
      _count: { select: { items: true, estimates: true } },
    },
  });
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
