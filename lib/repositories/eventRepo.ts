import type { Prisma } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/api/errors";
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

export async function listEvents(orgId: string): Promise<EventWithRelations[]> {
  return prisma.event.findMany({
    where: { orgId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: includeRelations,
  });
}

function assertJobHasEstimate(
  type: string | undefined,
  estimateId: number | null | undefined
) {
  if (type === "job" && (estimateId === null || estimateId === undefined)) {
    throw new ValidationError("Job events require a estimateId");
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
