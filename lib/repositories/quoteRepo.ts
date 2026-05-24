import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { QuoteHasEventsError, QuoteLockedError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export type QuoteWithEstimateSummary = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      select: {
        id: true;
        estimateNumber: true;
        title: true;
        customer: { select: { id: true; name: true; address: true } };
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    _count: { select: { lineItems: true } };
  };
}>;

/** Narrower payload used by listQuotesForEstimate — no lineItems or estimate.items needed there. */
export type QuoteWithEstimateSummaryNarrow = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      select: {
        id: true;
        estimateNumber: true;
        title: true;
        customer: { select: { id: true; name: true; address: true } };
      };
    };
    _count: { select: { lineItems: true } };
  };
}>;

export type QuoteWithDetails = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      include: {
        customer: true;
        items: { orderBy: { sortOrder: "asc" } };
      };
    };
    lineItems: { orderBy: { sortOrder: "asc" } };
    org: { select: { name: true } };
    signature: { select: { signedByName: true } };
    quoteEvents: {
      where: { type: "declined" };
      orderBy: { createdAt: "desc" };
      take: 1;
    };
    revisedFrom: { select: { id: true; quoteNumber: true } };
    revisedBy: { select: { id: true; quoteNumber: true } };
  };
}>;

export type QuoteWithPublicView = Prisma.QuoteGetPayload<{
  include: {
    estimate: {
      include: {
        customer: true;
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
    signature: true;
  };
}>;

type LineItemInput = Omit<
  Prisma.LineItemUncheckedCreateInput,
  "id" | "quoteId"
> & { id?: number };

export type QuotePatch = {
  status?: "draft" | "sent" | "accepted" | "declined";
  convenienceFeeRate?: number;
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemInput[];
};

export async function listQuotes(
  orgId: string
): Promise<QuoteWithEstimateSummary[]> {
  return prisma.quote.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      estimate: {
        select: {
          id: true,
          estimateNumber: true,
          title: true,
          customer: { select: { id: true, name: true, address: true } },
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function listQuotesForEstimate(
  estimateId: number,
  orgId: string
): Promise<QuoteWithEstimateSummaryNarrow[]> {
  return prisma.quote.findMany({
    where: { orgId, estimateId },
    orderBy: { createdAt: "desc" },
    include: {
      estimate: {
        select: {
          id: true,
          estimateNumber: true,
          title: true,
          customer: { select: { id: true, name: true, address: true } },
        },
      },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function getQuote(
  id: number,
  orgId: string
): Promise<QuoteWithDetails | null> {
  return prisma.quote.findFirst({
    where: { id, orgId },
    include: {
      estimate: {
        include: {
          customer: true,
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      org: { select: { name: true } },
      signature: { select: { signedByName: true } },
      quoteEvents: {
        where: { type: "declined" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      revisedFrom: { select: { id: true, quoteNumber: true } },
      revisedBy: { select: { id: true, quoteNumber: true } },
    },
  });
}

export async function createQuote(
  orgId: string,
  input: { estimateId: number }
): Promise<QuoteWithDetails | null> {
  return prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: { id: input.estimateId, orgId },
      select: { id: true },
    });
    if (!estimate) return null;

    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: {
        nextQuoteNumber: true,
        defaultDepositPct: true,
        defaultTerms: true,
        defaultValidityDays: true,
      },
    });
    const quoteNumber = org?.nextQuoteNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextQuoteNumber: quoteNumber + 1 },
    });

    const created = await tx.quote.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        quoteNumber,
        status: "draft",
        convenienceFeeRate: 0.03,
        markupPct: 0,
        depositPct: org?.defaultDepositPct ?? 0.3,
        terms: org?.defaultTerms ?? "",
        validityDays: org?.defaultValidityDays ?? 21,
      },
    });

    return tx.quote.findFirst({
      where: { id: created.id, orgId },
      include: {
        estimate: {
          include: {
            customer: true,
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
        org: { select: { name: true } },
        signature: { select: { signedByName: true } },
        quoteEvents: {
          where: { type: "declined" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        revisedFrom: { select: { id: true, quoteNumber: true } },
        revisedBy: { select: { id: true, quoteNumber: true } },
      },
    });
  });
}

export async function saveQuote(
  id: number,
  orgId: string,
  patch: QuotePatch
): Promise<QuoteWithDetails | null> {
  const { lineItems, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({
      where: { id, orgId },
      select: { id: true, status: true },
    });
    if (!existing) return null;
    if (existing.status === "accepted" || existing.status === "declined") {
      throw new QuoteLockedError(existing.status);
    }

    if (Object.keys(topLevel).length > 0) {
      const result = await tx.quote.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.quote.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (lineItems !== undefined) {
      await tx.lineItem.deleteMany({ where: { quoteId: id } });
      if (lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: lineItems.map(({ id: _id, ...li }) => ({
            ...li,
            quoteId: id,
          })),
        });
      }
    }

    return tx.quote.findFirst({
      where: { id, orgId },
      include: {
        estimate: {
          include: {
            customer: true,
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
        org: { select: { name: true } },
        signature: { select: { signedByName: true } },
        quoteEvents: {
          where: { type: "declined" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        revisedFrom: { select: { id: true, quoteNumber: true } },
        revisedBy: { select: { id: true, quoteNumber: true } },
      },
    });
  });
}

/**
 * Delete a quote. Refuses (throws QuoteHasEventsError) when any Event still
 * references it — those are jobs that depend on this quote per the
 * type=job→quoteId invariant.
 */
export async function deleteQuote(id: number, orgId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const eventCount = await tx.event.count({
      where: { orgId, quoteId: id },
    });
    if (eventCount > 0) throw new QuoteHasEventsError(eventCount);
    const result = await tx.quote.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}

/**
 * Generate (or rotate) the public approval token for a quote.
 * Returns the new token, or null if the quote isn't found in the org.
 */
export async function rotateApprovalToken(
  id: number,
  orgId: string
): Promise<string | null> {
  const token = generateToken();
  const result = await prisma.quote.updateMany({
    where: { id, orgId },
    data: { approvalToken: token },
  });
  return result.count > 0 ? token : null;
}

/**
 * Clone an accepted or declined quote into a new draft quote on the
 * same estimate. The new quote is linked back via `revisedFromId`.
 * Returns null if the source quote isn't found / not in the org.
 */
export async function reviseQuote(
  quoteId: number,
  orgId: string
): Promise<{ id: number } | null> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.quote.findFirst({
      where: { id: quoteId, orgId },
      include: { lineItems: true },
    });
    if (!original) return null;

    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextQuoteNumber: { increment: 1 } },
      select: { nextQuoteNumber: true },
    });
    const newQuoteNumber = org.nextQuoteNumber - 1;

    const created = await tx.quote.create({
      data: {
        orgId: original.orgId,
        estimateId: original.estimateId,
        quoteNumber: newQuoteNumber,
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
          quoteId: created.id,
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

    await tx.quoteEvent.create({
      data: {
        quoteId: created.id,
        type: "revised_from",
        source: "builder",
        metadata: {
          revisedFromId: original.id,
          revisedFromQuoteNumber: original.quoteNumber,
        },
      },
    });

    return { id: created.id };
  });
}

export interface MarkQuoteSentInput {
  to: string;
  subject: string;
  sentByEmail: string;
  sentByName: string;
}

/**
 * Mark a quote as sent (or resent). Updates Quote.status/sentAt/etc. and
 * appends a QuoteEvent of type 'sent' (first send) or 'resent' (subsequent).
 * Returns false if the quote isn't in the org.
 */
export async function markQuoteSent(
  id: number,
  orgId: string,
  input: MarkQuoteSentInput
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, sentAt: true },
    });
    if (!existing) return false;

    await tx.quote.updateMany({
      where: { id, orgId },
      data: {
        status:
          existing.status === "accepted" || existing.status === "declined"
            ? existing.status
            : "sent",
        sentAt: new Date(),
        sentToEmail: input.to,
        sentByEmail: input.sentByEmail,
        sentByName: input.sentByName,
      },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId: id,
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

export interface MarkQuoteViewedInput {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Mark a quote as viewed by the customer. Idempotent w.r.t. status (only flips
 * sent → viewed) but always appends a QuoteEvent of type 'viewed' so we can
 * count opens. No-op when the quote is already accepted/declined.
 */
export async function markQuoteViewed(
  quoteId: number,
  input: MarkQuoteViewedInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!q) return;
    if (q.status === "accepted" || q.status === "declined") return;

    if (q.status === "sent") {
      await tx.quote.updateMany({
        where: { id: quoteId, status: "sent" },
        data: { status: "viewed", viewedAt: new Date() },
      });
    }

    await tx.quoteEvent.create({
      data: {
        quoteId,
        type: "viewed",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  });
}

export interface DeclineQuoteInput {
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type DeclineResult =
  | "ok"
  | "already_signed"
  | "already_declined"
  | "not_found";

/**
 * Decline a quote (public-token initiated). Atomic: status guard → flip
 * status to "declined" → append a QuoteEvent of type "declined" with the
 * optional reason in metadata.
 */
export async function declineQuoteByToken(
  quoteId: number,
  input: DeclineQuoteInput
): Promise<DeclineResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!q) return "not_found";
    if (q.status === "accepted") return "already_signed";
    if (q.status === "declined") return "already_declined";

    await tx.quote.updateMany({
      where: { id: quoteId, status: { in: ["draft", "sent", "viewed"] } },
      data: {
        status: "declined",
        declinedAt: new Date(),
        declineReason: input.reason,
      },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId,
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
 * Look up a quote by its public approval token (no org scoping — the token
 * itself authorizes access). Returns null on miss.
 */
export async function getQuoteByToken(
  token: string
): Promise<QuoteWithPublicView | null> {
  return prisma.quote.findUnique({
    where: { approvalToken: token },
    include: {
      estimate: {
        include: {
          customer: true,
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
      signature: true,
    },
  });
}
