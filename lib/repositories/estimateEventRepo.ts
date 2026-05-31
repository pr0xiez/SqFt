import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type EstimateEventType =
  | "sent"
  | "viewed"
  | "approved"
  | "declined"
  | "link_rotated"
  | "resent"
  | "revised_from";

export interface WriteEstimateEventInput {
  estimateId: number;
  type: EstimateEventType;
  source?: "builder" | "customer" | "system_supersede";
  actorEmail?: string | null;
  actorName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

type Tx = Pick<PrismaClient, "estimateEvent">;

export async function writeEstimateEvent(
  input: WriteEstimateEventInput,
  client: Tx = prisma
): Promise<void> {
  await client.estimateEvent.create({
    data: {
      estimateId: input.estimateId,
      type: input.type,
      source: input.source ?? undefined,
      actorEmail: input.actorEmail ?? null,
      actorName: input.actorName ?? null,
      ip: input.ip ?? undefined,
      userAgent: input.userAgent ?? undefined,
      metadata: input.metadata ?? undefined,
    },
  });
}
