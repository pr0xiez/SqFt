import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface ApproveEstimateInput {
  estimateId: number;
  ip: string;
  userAgent: string;
  snapshot: Prisma.InputJsonValue;
}

export type ApproveEstimateResult =
  | "ok"
  | "already_approved"
  | "declined"
  | "not_found";

/**
 * Atomically record a one-click customer approval: write the EstimateApproval
 * row, flip Estimate.status to "approved", append an "approved" EstimateEvent,
 * and supersede (auto-decline) any open sibling estimates on the same site
 * measure. Concurrent calls for the same estimate fail at the
 * EstimateApproval.estimateId @unique constraint and return "already_approved".
 */
export async function approveEstimateByToken(
  input: ApproveEstimateInput
): Promise<ApproveEstimateResult> {
  return prisma.$transaction(async (tx) => {
    const e = await tx.estimate.findFirst({
      where: { id: input.estimateId },
      select: {
        id: true,
        status: true,
        siteMeasureId: true,
        estimateNumber: true,
      },
    });
    if (!e) return "not_found" as const;
    if (e.status === "approved") return "already_approved" as const;
    if (e.status === "declined") return "declined" as const;

    try {
      await tx.estimateApproval.create({
        data: {
          estimateId: input.estimateId,
          ip: input.ip,
          userAgent: input.userAgent,
          snapshot: input.snapshot,
        },
      });
    } catch (err) {
      // EstimateApproval.estimateId is @unique, so a concurrent double-approval
      // races to insert and one loses with P2002. Match on the stable error
      // code, not the human-readable message.
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        return "already_approved" as const;
      }
      throw err;
    }

    await tx.estimate.updateMany({
      where: {
        id: input.estimateId,
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: { status: "approved", approvedAt: new Date() },
    });

    await tx.estimateEvent.create({
      data: {
        estimateId: input.estimateId,
        type: "approved",
        source: "customer",
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    const openSiblings = await tx.estimate.findMany({
      where: {
        siteMeasureId: e.siteMeasureId,
        id: { not: e.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      select: { id: true },
    });
    const declineReason = `Superseded — customer approved Estimate #${e.estimateNumber}`;
    await tx.estimate.updateMany({
      where: {
        siteMeasureId: e.siteMeasureId,
        id: { not: e.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: { status: "declined", declinedAt: new Date(), declineReason },
    });
    if (openSiblings.length > 0) {
      await tx.estimateEvent.createMany({
        data: openSiblings.map((s) => ({
          estimateId: s.id,
          type: "declined",
          source: "system_supersede",
          metadata: {
            supersededByEstimateId: e.id,
            supersededByEstimateNumber: e.estimateNumber,
          },
        })),
      });
    }
    return "ok" as const;
  });
}

export function getEstimateApproval(estimateId: number, orgId: string) {
  return prisma.estimateApproval.findFirst({
    where: { estimateId, estimate: { orgId } },
  });
}
