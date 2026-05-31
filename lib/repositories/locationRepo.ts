import { prisma } from "@/lib/prisma";

export interface CreateLocationInput {
  orgId: string;
  customerId: number;
  address: string;
  label?: string | null;
  notes?: string | null;
}

// Returns null when the customer doesn't belong to the caller's org, so the
// route can surface a 404 — a location must never link to another org's
// customer (mirrors createEstimate's siteMeasure ownership check).
export async function createLocation(input: CreateLocationInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, orgId: input.orgId },
    select: { id: true },
  });
  if (!customer) return null;
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
