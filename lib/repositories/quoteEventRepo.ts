import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type QuoteEventType =
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "link_rotated"
  | "resent";

export interface WriteQuoteEventInput {
  quoteId: number;
  type: QuoteEventType;
  actorEmail?: string | null;
  actorName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

type Tx = Pick<PrismaClient, "quoteEvent">;

export async function writeQuoteEvent(
  input: WriteQuoteEventInput,
  client: Tx = prisma
): Promise<void> {
  await client.quoteEvent.create({
    data: {
      quoteId: input.quoteId,
      type: input.type,
      actorEmail: input.actorEmail ?? null,
      actorName: input.actorName ?? null,
      ip: input.ip ?? undefined,
      userAgent: input.userAgent ?? undefined,
      metadata: input.metadata ?? undefined,
    },
  });
}
