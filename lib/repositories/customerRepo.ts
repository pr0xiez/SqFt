import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const LIST_QUOTE_SELECT = {
  status: true,
  sentAt: true,
  viewedAt: true,
  acceptedAt: true,
  declinedAt: true,
  createdAt: true,
} as const;

const DETAIL_QUOTE_SELECT = {
  id: true,
  quoteNumber: true,
  status: true,
  date: true,
  sentAt: true,
  viewedAt: true,
  acceptedAt: true,
  declinedAt: true,
  createdAt: true,
  _count: { select: { lineItems: true } },
} as const;

export type CustomerWithCount = Prisma.CustomerGetPayload<{
  include: {
    _count: { select: { estimates: true } };
    estimates: {
      select: {
        quotes: { select: typeof LIST_QUOTE_SELECT };
      };
    };
  };
}>;

export type CustomerWithEstimates = Prisma.CustomerGetPayload<{
  include: {
    estimates: {
      orderBy: { createdAt: "desc" };
      include: {
        quotes: {
          orderBy: { createdAt: "desc" };
          select: typeof DETAIL_QUOTE_SELECT;
        };
      };
    };
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
    include: {
      _count: { select: { estimates: true } },
      estimates: {
        select: {
          quotes: { select: LIST_QUOTE_SELECT },
        },
      },
    },
  });
}

export async function getCustomer(
  id: number,
  orgId: string
): Promise<CustomerWithEstimates | null> {
  return prisma.customer.findFirst({
    where: { id, orgId },
    include: {
      estimates: {
        orderBy: { createdAt: "desc" },
        include: {
          quotes: {
            orderBy: { createdAt: "desc" },
            select: DETAIL_QUOTE_SELECT,
          },
        },
      },
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
