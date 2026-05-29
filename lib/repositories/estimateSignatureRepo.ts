import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface AcceptEstimateInput {
  estimateId: number;
  signedByName: string;
  signedByEmail: string;
  signatureData: string;
  consentText: string;
  estimateSnapshot: Prisma.InputJsonValue;
  snapshotHash: string;
  signedIp: string;
  signedUserAgent: string;
}

export type AcceptEstimateResult =
  | "ok"
  | "already_signed"
  | "declined"
  | "not_found";

/**
 * Atomically write the EstimateSignature, flip Estimate.status to accepted,
 * and append a 'accepted' EstimateEvent. Concurrent calls for the same
 * estimate will fail at the EstimateSignature.estimateId @unique constraint and
 * return "already_signed".
 */
export async function acceptEstimateByToken(
  input: AcceptEstimateInput
): Promise<AcceptEstimateResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.estimate.findFirst({
      where: { id: input.estimateId },
      select: {
        id: true,
        status: true,
        siteMeasureId: true,
        estimateNumber: true,
      },
    });
    if (!q) return "not_found" as const;
    if (q.status === "accepted") return "already_signed" as const;
    if (q.status === "declined") return "declined" as const;

    try {
      await tx.estimateSignature.create({
        data: {
          estimateId: input.estimateId,
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signatureData: input.signatureData,
          signedIp: input.signedIp,
          signedUserAgent: input.signedUserAgent,
          consentText: input.consentText,
          estimateSnapshot: input.estimateSnapshot,
          snapshotHash: input.snapshotHash,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique")) {
        return "already_signed" as const;
      }
      throw err;
    }

    await tx.estimate.updateMany({
      where: {
        id: input.estimateId,
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    await tx.estimateEvent.create({
      data: {
        estimateId: input.estimateId,
        type: "accepted",
        source: "customer",
        actorEmail: input.signedByEmail,
        actorName: input.signedByName,
        ip: input.signedIp,
        userAgent: input.signedUserAgent,
      },
    });

    // Identify open siblings, then sweep them to declined.
    const openSiblings = await tx.estimate.findMany({
      where: {
        siteMeasureId: q.siteMeasureId,
        id: { not: q.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      select: { id: true, estimateNumber: true },
    });

    const declineReason = `Superseded — customer accepted Estimate #${q.estimateNumber}`;
    await tx.estimate.updateMany({
      where: {
        siteMeasureId: q.siteMeasureId,
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
      await tx.estimateEvent.createMany({
        data: openSiblings.map((s) => ({
          estimateId: s.id,
          type: "declined",
          source: "system_supersede",
          metadata: {
            supersededByEstimateId: q.id,
            supersededByEstimateNumber: q.estimateNumber,
          },
        })),
      });
    }

    return "ok" as const;
  });
}

export async function getEstimateSignature(estimateId: number) {
  return prisma.estimateSignature.findUnique({ where: { estimateId } });
}
