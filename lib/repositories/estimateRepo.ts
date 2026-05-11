import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type EstimateWithCustomerAndCount = Prisma.EstimateGetPayload<{
  include: {
    customer: { select: { id: true; name: true; address: true } };
    _count: { select: { items: true; quotes: true } };
  };
}>;

export type EstimateWithDetails = Prisma.EstimateGetPayload<{
  include: {
    customer: true;
    items: { orderBy: { sortOrder: "asc" } };
    quotes: {
      orderBy: { createdAt: "desc" };
      select: {
        id: true;
        quoteNumber: true;
        status: true;
        date: true;
        createdAt: true;
        _count: { select: { lineItems: true } };
      };
    };
  };
}>;

type EstimateItemInput = Omit<
  Prisma.EstimateItemUncheckedCreateInput,
  "id" | "estimateId"
> & {
  id?: number;
};

export type EstimatePatch = {
  title?: string;
  customerId?: number;
  items?: EstimateItemInput[];
};

export async function listEstimates(
  orgId: string
): Promise<EstimateWithCustomerAndCount[]> {
  return prisma.estimate.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, address: true } },
      _count: { select: { items: true, quotes: true } },
    },
  });
}

export async function getEstimate(
  id: number,
  orgId: string
): Promise<EstimateWithDetails | null> {
  return prisma.estimate.findFirst({
    where: { id, orgId },
    include: {
      customer: true,
      items: { orderBy: { sortOrder: "asc" } },
      quotes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          date: true,
          createdAt: true,
          _count: { select: { lineItems: true } },
        },
      },
    },
  });
}

export async function createEstimate(
  orgId: string,
  data: Omit<Prisma.EstimateUncheckedCreateInput, "orgId" | "estimateNumber">
) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { nextEstimateNumber: true },
    });
    const estimateNumber = org?.nextEstimateNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextEstimateNumber: estimateNumber + 1 },
    });
    return tx.estimate.create({ data: { ...data, orgId, estimateNumber } });
  });
}

export async function saveEstimate(
  id: number,
  orgId: string,
  patch: EstimatePatch
): Promise<EstimateWithDetails | null> {
  const { items, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    if (Object.keys(topLevel).length > 0) {
      const result = await tx.estimate.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.estimate.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (items !== undefined) {
      await tx.estimateItem.deleteMany({ where: { estimateId: id } });
      if (items.length > 0) {
        await tx.estimateItem.createMany({
          data: items.map(({ id: _id, ...item }) => ({
            ...item,
            estimateId: id,
          })),
        });
      }
    }

    return tx.estimate.findFirst({
      where: { id, orgId },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
        quotes: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            quoteNumber: true,
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

export async function deleteEstimate(
  id: number,
  orgId: string
): Promise<boolean> {
  const result = await prisma.estimate.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
