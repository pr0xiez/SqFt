import type { Prisma } from "@/app/generated/prisma/client";
import { CrewMemberInUseError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type CrewMemberWithCount = Prisma.CrewMemberGetPayload<{
  include: { _count: { select: { events: true } } };
}>;

export type CrewMemberSummary = {
  id: number;
  name: string;
  role: string;
};

export async function listCrewMembers(
  orgId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<CrewMemberWithCount[]> {
  return prisma.crewMember.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { events: true } } },
  });
}

export async function createCrewMember(
  orgId: string,
  data: { name: string; role?: string }
) {
  return prisma.crewMember.create({
    data: { orgId, name: data.name, role: data.role ?? "" },
  });
}

export async function updateCrewMember(
  id: number,
  orgId: string,
  data: { name?: string; role?: string; archived?: boolean }
) {
  const result = await prisma.crewMember.updateMany({
    where: { id, orgId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.crewMember.findFirst({ where: { id, orgId } });
}

export async function deleteCrewMember(id: number, orgId: string) {
  const member = await prisma.crewMember.findFirst({
    where: { id, orgId },
    include: { _count: { select: { events: true } } },
  });
  if (!member) return { ok: false as const, reason: "not-found" as const };
  if (member._count.events > 0) {
    throw new CrewMemberInUseError(
      "Crew member is assigned to events. Archive instead of deleting."
    );
  }
  await prisma.crewMember.delete({ where: { id } });
  return { ok: true as const };
}

/**
 * Validates that every id in `ids` belongs to `orgId`. Returns `true` if so,
 * `false` otherwise.
 */
export async function validateCrewMemberIds(
  orgId: string,
  ids: number[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.crewMember.count({
    where: { id: { in: ids }, orgId },
  });
  return count === ids.length;
}
