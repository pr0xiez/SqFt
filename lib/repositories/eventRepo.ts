import type { Prisma } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/api/errors";
import { resolveEventAddress } from "@/lib/events/serialize";
import { prisma } from "@/lib/prisma";
import { timeToMinutes } from "@/lib/utils";

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
 * Merge one field of a Prisma update payload over the stored value:
 * `undefined` means the PATCH left the field alone, and Prisma accepts both a
 * bare scalar and a `{ set }` wrapper for the ones it does send.
 */
function scalarOr<T>(incoming: unknown, stored: T): T {
  if (incoming === undefined) return stored;
  if (incoming !== null && typeof incoming === "object" && "set" in incoming) {
    const { set } = incoming as { set?: T };
    return set === undefined ? stored : set;
  }
  return incoming as T;
}

/** Day part of a Prisma date field, for comparing `date` against `endDate`. */
function dayOf(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * A same-day event must end after it starts. `eventCreateSchema` can enforce
 * this on its own, but a PATCH may send only one of the four fields, so the
 * zod refine on `eventUpdateSchema` can't see the merged result — this is the
 * backstop that validates stored ∪ incoming. Multi-day events may wrap past
 * midnight, so the rule only applies when the merged event is single-day.
 */
function assertSameDayTimesOrdered(
  date: Date | string | null,
  endDate: Date | string | null,
  startTime: string,
  endTime: string
) {
  const day = dayOf(date);
  const endDay = dayOf(endDate);
  const sameDay = endDay === null || day === null || endDay <= day;
  if (sameDay && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new ValidationError("End time must be after start time");
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
  assertSameDayTimesOrdered(
    data.date,
    data.endDate ?? null,
    data.startTime,
    data.endTime
  );
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
    select: {
      type: true,
      estimateId: true,
      date: true,
      endDate: true,
      startTime: true,
      endTime: true,
    },
  });
  if (!current) return null;

  const nextType = typeof data.type === "string" ? data.type : current.type;
  const nextEstimateId =
    data.estimateId === undefined
      ? current.estimateId
      : (data.estimateId as number | null);
  assertJobHasEstimate(nextType, nextEstimateId);
  assertSameDayTimesOrdered(
    scalarOr(data.date, current.date),
    scalarOr(data.endDate, current.endDate),
    scalarOr(data.startTime, current.startTime),
    scalarOr(data.endTime, current.endTime)
  );
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
