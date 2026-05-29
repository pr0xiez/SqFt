import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type SiteMeasureWithCustomerAndCount = Prisma.SiteMeasureGetPayload<{
  include: {
    customer: { select: { id: true; name: true; address: true } };
    _count: { select: { items: true; estimates: true } };
  };
}>;

export type SiteMeasureWithDetails = Prisma.SiteMeasureGetPayload<{
  include: {
    customer: true;
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
  customerId?: number;
  items?: SiteMeasureItemInput[];
};

export async function listSiteMeasures(
  orgId: string
): Promise<SiteMeasureWithCustomerAndCount[]> {
  return prisma.siteMeasure.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, address: true } },
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
      customer: true,
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
        customer: true,
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
