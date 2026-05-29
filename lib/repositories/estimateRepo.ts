import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { EstimateHasEventsError, EstimateLockedError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export type EstimateWithSiteMeasureSummary = Prisma.EstimateGetPayload<{
  include: {
    siteMeasure: {
      select: {
        id: true;
        siteMeasureNumber: true;
        title: true;
        location: {
          select: {
            id: true;
            address: true;
            customer: { select: { id: true; name: true } };
          };
        };
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    _count: { select: { lineItems: true } };
  };
}>;

/** Narrower payload used by listEstimatesForSiteMeasure — no lineItems or siteMeasure.items needed there. */
export type EstimateWithSiteMeasureSummaryNarrow = Prisma.EstimateGetPayload<{
  include: {
    siteMeasure: {
      select: {
        id: true;
        siteMeasureNumber: true;
        title: true;
        location: {
          select: {
            id: true;
            address: true;
            customer: { select: { id: true; name: true } };
          };
        };
      };
    };
    _count: { select: { lineItems: true } };
  };
}>;

export type EstimateWithDetails = Prisma.EstimateGetPayload<{
  include: {
    siteMeasure: {
      include: {
        location: { include: { customer: true } };
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    org: { select: { name: true } };
    estimateEvents: {
      where: { type: "declined" };
      orderBy: { createdAt: "desc" };
      take: 1;
    };
    revisedFrom: { select: { id: true; estimateNumber: true } };
    revisedBy: { select: { id: true; estimateNumber: true } };
  };
}>;

export type EstimateWithPublicView = Prisma.EstimateGetPayload<{
  include: {
    siteMeasure: {
      include: {
        location: { include: { customer: true } };
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    org: {
      select: {
        name: true;
        phone: true;
        address: true;
        licenseNumber: true;
        logo: true;
        users: {
          where: { role: "admin" };
          orderBy: { id: "asc" };
          take: 1;
          select: { email: true };
        };
      };
    };
    approval: true;
  };
}>;

type LineItemInput = Omit<
  Prisma.LineItemUncheckedCreateInput,
  "id" | "estimateId"
> & { id?: number };

export type EstimatePatch = {
  status?: "draft" | "sent" | "approved" | "declined";
  convenienceFeeRate?: number;
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemInput[];
};

export async function listEstimates(
  orgId: string
): Promise<EstimateWithSiteMeasureSummary[]> {
  return prisma.estimate.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      siteMeasure: {
        select: {
          id: true,
          siteMeasureNumber: true,
          title: true,
          location: {
            select: {
              id: true,
              address: true,
              customer: { select: { id: true, name: true } },
            },
          },
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function listEstimatesForSiteMeasure(
  siteMeasureId: number,
  orgId: string
): Promise<EstimateWithSiteMeasureSummaryNarrow[]> {
  return prisma.estimate.findMany({
    where: { orgId, siteMeasureId },
    orderBy: { createdAt: "desc" },
    include: {
      siteMeasure: {
        select: {
          id: true,
          siteMeasureNumber: true,
          title: true,
          location: {
            select: {
              id: true,
              address: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
      },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function getEstimate(
  id: number,
  orgId: string
): Promise<EstimateWithDetails | null> {
  return prisma.estimate.findFirst({
    where: { id, orgId },
    include: {
      siteMeasure: {
        include: {
          location: { include: { customer: true } },
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      org: { select: { name: true } },
      estimateEvents: {
        where: { type: "declined" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      revisedFrom: { select: { id: true, estimateNumber: true } },
      revisedBy: { select: { id: true, estimateNumber: true } },
    },
  });
}

export async function createEstimate(
  orgId: string,
  input: { siteMeasureId: number }
): Promise<EstimateWithDetails | null> {
  return prisma.$transaction(async (tx) => {
    const siteMeasure = await tx.siteMeasure.findFirst({
      where: { id: input.siteMeasureId, orgId },
      select: { id: true },
    });
    if (!siteMeasure) return null;

    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: {
        nextEstimateNumber: true,
        defaultDepositPct: true,
        defaultTerms: true,
        defaultValidityDays: true,
      },
    });
    const estimateNumber = org?.nextEstimateNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextEstimateNumber: estimateNumber + 1 },
    });

    const created = await tx.estimate.create({
      data: {
        orgId,
        siteMeasureId: input.siteMeasureId,
        estimateNumber,
        status: "draft",
        convenienceFeeRate: 0.03,
        markupPct: 0,
        depositPct: org?.defaultDepositPct ?? 0.3,
        terms: org?.defaultTerms ?? "",
        validityDays: org?.defaultValidityDays ?? 21,
      },
    });

    return tx.estimate.findFirst({
      where: { id: created.id, orgId },
      include: {
        siteMeasure: {
          include: {
            location: { include: { customer: true } },
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
        org: { select: { name: true } },
        estimateEvents: {
          where: { type: "declined" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        revisedFrom: { select: { id: true, estimateNumber: true } },
        revisedBy: { select: { id: true, estimateNumber: true } },
      },
    });
  });
}

export async function saveEstimate(
  id: number,
  orgId: string,
  patch: EstimatePatch
): Promise<EstimateWithDetails | null> {
  const { lineItems, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.estimate.findFirst({
      where: { id, orgId },
      select: { id: true, status: true },
    });
    if (!existing) return null;
    if (existing.status === "approved" || existing.status === "declined") {
      throw new EstimateLockedError(existing.status);
    }

    if (Object.keys(topLevel).length > 0) {
      const result = await tx.estimate.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.estimate.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (lineItems !== undefined) {
      await tx.lineItem.deleteMany({ where: { estimateId: id } });
      if (lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: lineItems.map(({ id: _id, ...li }) => ({
            ...li,
            estimateId: id,
          })),
        });
      }
    }

    return tx.estimate.findFirst({
      where: { id, orgId },
      include: {
        siteMeasure: {
          include: {
            location: { include: { customer: true } },
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
        org: { select: { name: true } },
        estimateEvents: {
          where: { type: "declined" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        revisedFrom: { select: { id: true, estimateNumber: true } },
        revisedBy: { select: { id: true, estimateNumber: true } },
      },
    });
  });
}

/**
 * Delete a estimate. Refuses (throws EstimateHasEventsError) when any Event still
 * references it — those are jobs that depend on this estimate per the
 * type=job→estimateId invariant.
 */
export async function deleteEstimate(
  id: number,
  orgId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const eventCount = await tx.event.count({
      where: { orgId, estimateId: id },
    });
    if (eventCount > 0) throw new EstimateHasEventsError(eventCount);
    const result = await tx.estimate.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}

/**
 * Generate (or rotate) the public approval token for a estimate.
 * Returns the new token, or null if the estimate isn't found in the org.
 */
export async function rotateApprovalToken(
  id: number,
  orgId: string
): Promise<string | null> {
  const token = generateToken();
  const result = await prisma.estimate.updateMany({
    where: { id, orgId },
    data: { approvalToken: token },
  });
  return result.count > 0 ? token : null;
}

/**
 * Clone an accepted or declined estimate into a new draft estimate on the
 * same siteMeasure. The new estimate is linked back via `revisedFromId`.
 * Returns null if the source estimate isn't found / not in the org.
 */
export async function reviseEstimate(
  estimateId: number,
  orgId: string
): Promise<{ id: number } | null> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.estimate.findFirst({
      where: { id: estimateId, orgId },
      include: { lineItems: true },
    });
    if (!original) return null;

    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextEstimateNumber: { increment: 1 } },
      select: { nextEstimateNumber: true },
    });
    const newEstimateNumber = org.nextEstimateNumber - 1;

    const created = await tx.estimate.create({
      data: {
        orgId: original.orgId,
        siteMeasureId: original.siteMeasureId,
        estimateNumber: newEstimateNumber,
        status: "draft",
        date: new Date(),
        convenienceFeeRate: original.convenienceFeeRate,
        markupPct: original.markupPct,
        depositPct: original.depositPct,
        approvalToken: generateToken(),
        revisedFromId: original.id,
      },
      select: { id: true },
    });

    if (original.lineItems.length > 0) {
      await tx.lineItem.createMany({
        data: original.lineItems.map((li) => ({
          estimateId: created.id,
          name: li.name,
          description: li.description,
          unitLabel: li.unitLabel,
          rate: li.rate,
          qtyMode: li.qtyMode,
          qty: li.qty,
          wastePct: li.wastePct,
          linkedRoomIds: li.linkedRoomIds ?? [],
          sortOrder: li.sortOrder,
        })),
      });
    }

    await tx.estimateEvent.create({
      data: {
        estimateId: created.id,
        type: "revised_from",
        source: "builder",
        metadata: {
          revisedFromId: original.id,
          revisedFromEstimateNumber: original.estimateNumber,
        },
      },
    });

    return { id: created.id };
  });
}

export interface MarkEstimateSentInput {
  to: string;
  subject: string;
  sentByEmail: string;
  sentByName: string;
}

/**
 * Mark a estimate as sent (or resent). Updates Estimate.status/sentAt/etc. and
 * appends a EstimateEvent of type 'sent' (first send) or 'resent' (subsequent).
 * Returns false if the estimate isn't in the org.
 */
export async function markEstimateSent(
  id: number,
  orgId: string,
  input: MarkEstimateSentInput
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.estimate.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, sentAt: true },
    });
    if (!existing) return false;

    await tx.estimate.updateMany({
      where: { id, orgId },
      data: {
        status:
          existing.status === "approved" || existing.status === "declined"
            ? existing.status
            : "sent",
        sentAt: new Date(),
        sentToEmail: input.to,
        sentByEmail: input.sentByEmail,
        sentByName: input.sentByName,
      },
    });

    await tx.estimateEvent.create({
      data: {
        estimateId: id,
        type: existing.sentAt ? "resent" : "sent",
        source: "builder",
        actorEmail: input.sentByEmail,
        actorName: input.sentByName,
        metadata: { to: input.to, subject: input.subject },
      },
    });

    return true;
  });
}

export interface MarkEstimateViewedInput {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Mark a estimate as viewed by the customer. Idempotent w.r.t. status (only flips
 * sent → viewed) but always appends a EstimateEvent of type 'viewed' so we can
 * count opens. No-op when the estimate is already accepted/declined.
 */
export async function markEstimateViewed(
  estimateId: number,
  input: MarkEstimateViewedInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const q = await tx.estimate.findFirst({
      where: { id: estimateId },
      select: { status: true },
    });
    if (!q) return;
    if (q.status === "approved" || q.status === "declined") return;

    if (q.status === "sent") {
      await tx.estimate.updateMany({
        where: { id: estimateId, status: "sent" },
        data: { status: "viewed", viewedAt: new Date() },
      });
    }

    await tx.estimateEvent.create({
      data: {
        estimateId,
        type: "viewed",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  });
}

export interface DeclineEstimateInput {
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type DeclineResult =
  | "ok"
  | "already_approved"
  | "already_declined"
  | "not_found";

/**
 * Decline a estimate (public-token initiated). Atomic: status guard → flip
 * status to "declined" → append a EstimateEvent of type "declined" with the
 * optional reason in metadata.
 */
export async function declineEstimateByToken(
  estimateId: number,
  input: DeclineEstimateInput
): Promise<DeclineResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.estimate.findFirst({
      where: { id: estimateId },
      select: { status: true },
    });
    if (!q) return "not_found";
    if (q.status === "approved") return "already_approved";
    if (q.status === "declined") return "already_declined";

    await tx.estimate.updateMany({
      where: { id: estimateId, status: { in: ["draft", "sent", "viewed"] } },
      data: {
        status: "declined",
        declinedAt: new Date(),
        declineReason: input.reason,
      },
    });

    await tx.estimateEvent.create({
      data: {
        estimateId,
        type: "declined",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
    });

    return "ok";
  });
}

/**
 * Look up a estimate by its public approval token (no org scoping — the token
 * itself authorizes access). Returns null on miss.
 */
export async function getEstimateByToken(
  token: string
): Promise<EstimateWithPublicView | null> {
  return prisma.estimate.findUnique({
    where: { approvalToken: token },
    include: {
      siteMeasure: {
        include: {
          location: { include: { customer: true } },
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      org: {
        select: {
          name: true,
          phone: true,
          address: true,
          licenseNumber: true,
          logo: true,
          users: {
            where: { role: "admin" },
            orderBy: { id: "asc" },
            take: 1,
            select: { email: true },
          },
        },
      },
      approval: true,
    },
  });
}
