import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

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

function assertJobHasQuote(
  type: string | undefined,
  quoteId: number | null | undefined
) {
  if (type === "job" && (quoteId === null || quoteId === undefined)) {
    throw new EventValidationError("Job events require a quoteId");
  }
}

export async function createEvent(
  orgId: string,
  data: Omit<Prisma.EventUncheckedCreateInput, "orgId">
) {
  assertJobHasQuote(data.type, data.quoteId ?? null);
  return prisma.event.create({ data: { ...data, orgId } });
}

export async function updateEvent(
  id: number,
  orgId: string,
  data: Prisma.EventUncheckedUpdateInput
) {
  // We need the merged shape (existing type + new quoteId, or new type +
  // existing quoteId) to validate, so resolve the current row first.
  const current = await prisma.event.findFirst({
    where: { id, orgId },
    select: { type: true, quoteId: true },
  });
  if (!current) return null;

  const nextType = typeof data.type === "string" ? data.type : current.type;
  const nextQuoteId =
    data.quoteId === undefined
      ? current.quoteId
      : (data.quoteId as number | null);
  assertJobHasQuote(nextType, nextQuoteId);

  const result = await prisma.event.updateMany({ where: { id, orgId }, data });
  if (result.count === 0) return null;
  return prisma.event.findFirst({ where: { id, orgId } });
}

export async function deleteEvent(id: number, orgId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
