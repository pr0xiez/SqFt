import type { Prisma } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type EventWithRelations = Prisma.EventGetPayload<{
  include: {
    customer: { select: { id: true; name: true; address: true } };
    crewMembers: { select: { id: true; name: true; role: true } };
  };
}>;

const includeRelations = {
  customer: { select: { id: true, name: true, address: true } },
  crewMembers: {
    select: { id: true, name: true, role: true },
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
  "orgId" | "crewMembers"
> & {
  crewMemberIds?: number[];
};

export type EventUpdateInput = Prisma.EventUncheckedUpdateInput & {
  crewMemberIds?: number[];
};

export async function createEvent(orgId: string, data: EventCreateInput) {
  assertJobHasEstimate(data.type, data.estimateId ?? null);
  const { crewMemberIds, ...rest } = data;
  return prisma.event.create({
    data: {
      ...rest,
      orgId,
      ...(crewMemberIds && crewMemberIds.length > 0
        ? { crewMembers: { connect: crewMemberIds.map((id) => ({ id })) } }
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

  const { crewMemberIds, ...rest } = data;

  return prisma.event.update({
    where: { id },
    data: {
      ...rest,
      ...(crewMemberIds !== undefined
        ? { crewMembers: { set: crewMemberIds.map((cid) => ({ id: cid })) } }
        : {}),
    },
    include: includeRelations,
  });
}

export async function deleteEvent(id: number, orgId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id, orgId } });
  return result.count > 0;
}
