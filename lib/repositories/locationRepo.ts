import { prisma } from "@/lib/prisma";

export interface CreateLocationInput {
  orgId: string;
  customerId: number;
  address: string;
  label?: string | null;
  notes?: string | null;
}

export function createLocation(input: CreateLocationInput) {
  return prisma.location.create({ data: { ...input } });
}

export function listLocationsForCustomer(orgId: string, customerId: number) {
  return prisma.location.findMany({
    where: { orgId, customerId },
    orderBy: { createdAt: "asc" },
  });
}

export function getLocation(orgId: string, id: number) {
  return prisma.location.findFirst({ where: { orgId, id } });
}
