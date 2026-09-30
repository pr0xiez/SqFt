import type { Prisma } from "@/app/generated/prisma/client";
import { OPEN_ESTIMATE_STATUSES } from "@/lib/estimateStatus";
import { prisma } from "@/lib/prisma";

export interface ApproveEstimateInput {
  estimateId: number;
  // Client metadata is nullable (see lib/http/clientMeta.ts) to match the
  // nullable EstimateEvent.ip/userAgent columns. EstimateApproval.ip/
  // userAgent are NOT NULL, so a missing value is coerced to a fallback
  // string only at that write below — the EstimateEvent write keeps the
  // real null so approve/decline log identically when metadata is absent.
  ip: string | null;
  userAgent: string | null;
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
          // NOT NULL columns: fall back to a sentinel when the caller has no
          // client metadata rather than storing null end-to-end.
          ip: input.ip ?? "unknown",
          userAgent: input.userAgent ?? "unknown",
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
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });

    const declineReason = `Superseded — customer approved Estimate #${e.estimateNumber}`;
    // PostgreSQL rechecks the status guard while updating each locked row.
    // RETURNING supplies only changed ids, so concurrent terminal transitions
    // cannot be overwritten or receive a false supersede event.
    const superseded = await tx.estimate.updateManyAndReturn({
      where: {
        siteMeasureId: e.siteMeasureId,
        id: { not: e.id },
        status: { in: [...OPEN_ESTIMATE_STATUSES] },
      },
      data: { status: "declined", declinedAt: new Date(), declineReason },
      select: { id: true },
    });
    if (superseded.length > 0) {
      await tx.estimateEvent.createMany({
        data: superseded.map(({ id }) => ({
          estimateId: id,
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
