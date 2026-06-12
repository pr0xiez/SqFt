import type { Prisma } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/api/errors";
import { resolveEventAddress } from "@/lib/events/serialize";
import { prisma } from "@/lib/prisma";

export type EventWithRelations = Prisma.EventGetPayload<{
  include: {
    customer: { select: { id: true; name: true } };
    assignees: { select: { id: true; name: true; title: true } };
  };
}>;

const includeRelations = {
  customer: { select: { id: true, name: true } },
  assignees: {
    select: { id: true, name: true, title: true },
    orderBy: { name: "asc" as const },
  },
} satisfies Prisma.EventInclude;

const listInclude = {
  assignees: {
    select: { id: true, name: true, title: true },
    orderBy: { name: "asc" as const },
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      locations: {
        select: { address: true },
        orderBy: { id: "asc" as const },
        take: 1,
      },
    },
  },
  estimate: {
    select: {
      estimateNumber: true,
      siteMeasure: { select: { location: { select: { address: true } } } },
    },
  },
} satisfies Prisma.EventInclude;

export async function listEvents(orgId: string) {
  const events = await prisma.event.findMany({
    where: { orgId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: listInclude,
  });

  return events.map((e) => ({
    id: e.id,
    orgId: e.orgId,
    type: e.type,
    title: e.title,
    customerId: e.customerId,
    estimateId: e.estimateId,
    date: e.date,
    endDate: e.endDate,
    startTime: e.startTime,
    endTime: e.endTime,
    notes: e.notes,
    createdAt: e.createdAt,
    assignees: e.assignees,
    customer: e.customer
      ? { id: e.customer.id, name: e.customer.name, phone: e.customer.phone }
      : null,
    estimateNumber: e.estimate?.estimateNumber ?? null,
    address: resolveEventAddress(e),
  }));
}

function assertJobHasEstimate(
  type: string | undefined,
  estimateId: number | null | undefined
) {
  if (type === "job" && (estimateId === null || estimateId === undefined)) {
    throw new ValidationError("Job events require a estimateId");
  }
}

/**
 * Event FKs are global autoincrement ids, so an unchecked customerId/estimateId
 * would let one org attach (and then read, via listEvents' include) another
 * org's customer or estimate. Pass `null`/`undefined` to skip a field — only
 * values actually being written are validated.
 */
async function assertFksInOrg(
  orgId: string,
  customerId: number | null | undefined,
  estimateId: number | null | undefined
) {
  if (customerId != null) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, orgId },
      select: { id: true },
    });
    if (!customer) throw new ValidationError("Invalid customer");
  }
  if (estimateId != null) {
    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId, orgId },
      select: { id: true },
    });
    if (!estimate) throw new ValidationError("Invalid estimate");
  }
}

export type EventCreateInput = Omit<
  Prisma.EventUncheckedCreateInput,
  "orgId" | "assignees"
> & {
  assigneeIds?: string[];
};

export type EventUpdateInput = Prisma.EventUncheckedUpdateInput & {
  assigneeIds?: string[];
};

export async function createEvent(orgId: string, data: EventCreateInput) {
  assertJobHasEstimate(data.type, data.estimateId ?? null);
  await assertFksInOrg(orgId, data.customerId, data.estimateId);
  const { assigneeIds, ...rest } = data;
  return prisma.event.create({
    data: {
      ...rest,
      orgId,
      ...(assigneeIds && assigneeIds.length > 0
        ? { assignees: { connect: assigneeIds.map((id) => ({ id })) } }
        : {}),
    },
    include: includeRelations,
  });
}

export async function updateEvent(
  id: number,
  orgId: string,
  data: EventUpdateInput
) {
  const current = await prisma.event.findFirst({
    where: { id, orgId },
    select: { type: true, estimateId: true },
  });
  if (!current) return null;

  const nextType = typeof data.type === "string" ? data.type : current.type;
  const nextEstimateId =
    data.estimateId === undefined
      ? current.estimateId
      : (data.estimateId as number | null);
  assertJobHasEstimate(nextType, nextEstimateId);
  await assertFksInOrg(
    orgId,
    typeof data.customerId === "number" ? data.customerId : null,
    typeof data.estimateId === "number" ? data.estimateId : null
  );

  const { assigneeIds, ...rest } = data;

  return prisma.event.update({
    where: { id },
    data: {
      ...rest,
      ...(assigneeIds !== undefined
        ? { assignees: { set: assigneeIds.map((uid) => ({ id: uid })) } }
        : {}),
    },
    include: includeRelations,
  });
}

export async function deleteEvent(id: number, orgId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
