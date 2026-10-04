import { locationAddressColumns } from "@/lib/locations/formatAddress";
import { prisma } from "@/lib/prisma";

export interface CreateLocationInput {
  orgId: string;
  customerId: number;
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat?: number | null;
  lon?: number | null;
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

  const { orgId, customerId, label, notes, ...parts } = input;

  return prisma.location.create({
    data: {
      orgId,
      customerId,
      ...locationAddressColumns(parts),
      label: label ?? null,
      notes: notes ?? null,
    },
  });
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

/**
 * Locations matching a search box (customer name, phone or email, or the
 * address itself), newest first, for the quick-create "New site measure"
 * picker. An empty query returns the most recently added locations.
 */
export function searchLocations(orgId: string, q: string, take = 8) {
  const term = q.trim();
  return prisma.location.findMany({
    where: {
      orgId,
      ...(term
        ? {
            OR: [
              { address: { contains: term, mode: "insensitive" } },
              { customer: { name: { contains: term, mode: "insensitive" } } },
              { customer: { phone: { contains: term } } },
              { customer: { email: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      address: true,
      label: true,
      customer: { select: { id: true, name: true } },
      _count: { select: { siteMeasures: true } },
    },
  });
}
