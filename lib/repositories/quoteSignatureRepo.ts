import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface AcceptQuoteInput {
  quoteId: number;
  signedByName: string;
  signedByEmail: string;
  signatureData: string;
  consentText: string;
  quoteSnapshot: Prisma.InputJsonValue;
  snapshotHash: string;
  signedIp: string;
  signedUserAgent: string;
}

export type AcceptQuoteResult =
  | "ok"
  | "already_signed"
  | "declined"
  | "not_found";

/**
 * Atomically write the QuoteSignature, flip Quote.status to accepted,
 * and append a 'accepted' QuoteEvent. Concurrent calls for the same
 * quote will fail at the QuoteSignature.quoteId @unique constraint and
 * return "already_signed".
 */
export async function acceptQuoteByToken(
  input: AcceptQuoteInput
): Promise<AcceptQuoteResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: input.quoteId },
      select: { id: true, status: true, estimateId: true, quoteNumber: true },
    });
    if (!q) return "not_found" as const;
    if (q.status === "accepted") return "already_signed" as const;
    if (q.status === "declined") return "declined" as const;

    try {
      await tx.quoteSignature.create({
        data: {
          quoteId: input.quoteId,
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signatureData: input.signatureData,
          signedIp: input.signedIp,
          signedUserAgent: input.signedUserAgent,
          consentText: input.consentText,
          quoteSnapshot: input.quoteSnapshot,
          snapshotHash: input.snapshotHash,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique")) {
        return "already_signed" as const;
      }
      throw err;
    }

    await tx.quote.updateMany({
      where: {
        id: input.quoteId,
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId: input.quoteId,
        type: "accepted",
        source: "customer",
        actorEmail: input.signedByEmail,
        actorName: input.signedByName,
        ip: input.signedIp,
        userAgent: input.signedUserAgent,
      },
    });

    // Identify open siblings, then sweep them to declined.
    const openSiblings = await tx.quote.findMany({
      where: {
        estimateId: q.estimateId,
        id: { not: q.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      select: { id: true, quoteNumber: true },
    });

    const declineReason = `Superseded — customer accepted Quote #${q.quoteNumber}`;
    await tx.quote.updateMany({
      where: {
        estimateId: q.estimateId,
        id: { not: q.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: {
        status: "declined",
        declinedAt: new Date(),
        declineReason,
      },
    });

    if (openSiblings.length > 0) {
      await tx.quoteEvent.createMany({
        data: openSiblings.map((s) => ({
          quoteId: s.id,
          type: "declined",
          source: "system_supersede",
          metadata: {
            supersededByQuoteId: q.id,
            supersededByQuoteNumber: q.quoteNumber,
          },
        })),
      });
    }

    return "ok" as const;
  });
}

export async function getQuoteSignature(quoteId: number) {
  return prisma.quoteSignature.findUnique({ where: { quoteId } });
}
