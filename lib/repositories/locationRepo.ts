import { formatAddress } from "@/lib/locations/formatAddress";
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
  const address = formatAddress(parts);

  return prisma.location.create({
    data: {
      orgId,
      customerId,
      address,
      street: parts.street,
      unit: parts.unit ?? null,
      city: parts.city,
      state: parts.state,
      postalCode: parts.postalCode,
      lat: parts.lat ?? null,
      lon: parts.lon ?? null,
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
