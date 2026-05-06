import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CustomerWithCount = Prisma.CustomerGetPayload<{
  include: { _count: { select: { estimates: true } } };
}>;

export type CustomerWithEstimates = Prisma.CustomerGetPayload<{
  include: {
    estimates: { orderBy: { createdAt: "desc" } };
    _count: { select: { estimates: true } };
  };
}>;

export type CustomerCreate = Prisma.CustomerCreateInput extends {
  orgId: string;
}
  ? Omit<Prisma.CustomerUncheckedCreateInput, "orgId" | "id" | "createdAt">
  : never;

export type CustomerUpdate = Prisma.CustomerUncheckedUpdateInput;

export async function listCustomers(
  orgId: string
): Promise<CustomerWithCount[]> {
  return prisma.customer.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { estimates: true } } },
  });
}

export async function getCustomer(
  id: number,
  orgId: string
): Promise<CustomerWithEstimates | null> {
  return prisma.customer.findFirst({
    where: { id, orgId },
    include: {
      estimates: { orderBy: { createdAt: "desc" } },
      _count: { select: { estimates: true } },
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

export async function deleteCustomer(
  id: number,
  orgId: string
): Promise<boolean> {
  const result = await prisma.customer.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
