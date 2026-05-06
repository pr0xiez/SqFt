import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type EstimateWithCustomerAndCount = Prisma.EstimateGetPayload<{
  include: {
    customer: { select: { id: true; name: true; address: true } };
    _count: { select: { items: true } };
  };
}>;

export type EstimateWithDetails = Prisma.EstimateGetPayload<{
  include: {
    customer: true;
    items: { orderBy: { sortOrder: "asc" } };
    lineItems: { orderBy: { sortOrder: "asc" } };
  };
}>;

type EstimateItemInput = Omit<
  Prisma.EstimateItemUncheckedCreateInput,
  "id" | "estimateId"
> & { id?: number };

type LineItemInput = Omit<
  Prisma.LineItemUncheckedCreateInput,
  "id" | "estimateId"
> & { id?: number };

export type EstimatePatch = {
  title?: string;
  status?: "quote" | "scheduled" | "in_progress" | "completed";
  taxRate?: number;
  markupPct?: number;
  depositPct?: number;
  items?: EstimateItemInput[];
  lineItems?: LineItemInput[];
};

export async function listEstimates(
  orgId: string
): Promise<EstimateWithCustomerAndCount[]> {
  return prisma.estimate.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, address: true } },
      _count: { select: { items: true } },
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
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function createEstimate(
  orgId: string,
  data: Omit<Prisma.EstimateUncheckedCreateInput, "orgId">
) {
  return prisma.estimate.create({ data: { ...data, orgId } });
}

export async function saveEstimate(
  id: number,
  orgId: string,
  patch: EstimatePatch
): Promise<EstimateWithDetails | null> {
  const { items, lineItems, ...topLevel } = patch;

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

    if (lineItems !== undefined) {
      await tx.lineItem.deleteMany({ where: { estimateId: id } });
      if (lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: lineItems.map(({ id: _id, ...li }) => ({
            ...li,
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
        lineItems: { orderBy: { sortOrder: "asc" } },
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
