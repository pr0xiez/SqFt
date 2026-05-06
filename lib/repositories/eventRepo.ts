import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type EventWithCustomer = Prisma.EventGetPayload<{
  include: { customer: { select: { id: true; name: true; address: true } } };
}>;

export async function listEvents(orgId: string): Promise<EventWithCustomer[]> {
  return prisma.event.findMany({
    where: { orgId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: {
      customer: { select: { id: true, name: true, address: true } },
    },
  });
}

export async function createEvent(
  orgId: string,
  data: Omit<Prisma.EventUncheckedCreateInput, "orgId">
) {
  return prisma.event.create({ data: { ...data, orgId } });
}

export async function updateEvent(
  id: number,
  orgId: string,
  data: Prisma.EventUncheckedUpdateInput
) {
  const result = await prisma.event.updateMany({ where: { id, orgId }, data });
  if (result.count === 0) return null;
  return prisma.event.findFirst({ where: { id, orgId } });
}

export async function deleteEvent(id: number, orgId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
