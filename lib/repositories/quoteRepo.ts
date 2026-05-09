import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
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
      };
    };
  };
}>;

type LineItemInput = Omit<
  Prisma.LineItemUncheckedCreateInput,
  "id" | "quoteId"
> & { id?: number };

export type QuotePatch = {
  status?: "draft" | "sent" | "accepted" | "declined";
  taxRate?: number;
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
      select: { nextQuoteNumber: true },
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
        taxRate: 0.08,
        markupPct: 0,
        depositPct: 0.5,
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
      },
    });
  });
}

export class QuoteHasEventsError extends Error {
  constructor(public readonly eventCount: number) {
    super(`Quote has ${eventCount} scheduled event(s)`);
    this.name = "QuoteHasEventsError";
  }
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
        },
      },
    },
  });
}
