import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteFindMany = vi.fn();
const quoteFindFirst = vi.fn();
const quoteFindUnique = vi.fn();
const quoteCreate = vi.fn();
const txQuoteCreate = vi.fn();
const quoteUpdateMany = vi.fn();
const quoteDeleteMany = vi.fn();
const quoteCount = vi.fn();
const lineItemDeleteMany = vi.fn();
const lineItemCreateMany = vi.fn();
const estimateFindFirst = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();
const eventCount = vi.fn();

const txMock: {
  quote: {
    updateMany: typeof quoteUpdateMany;
    count: typeof quoteCount;
    findFirst: typeof quoteFindFirst;
    create: typeof txQuoteCreate;
    deleteMany: typeof quoteDeleteMany;
  };
  lineItem: {
    deleteMany: typeof lineItemDeleteMany;
    createMany: typeof lineItemCreateMany;
  };
  estimate: { findFirst: typeof estimateFindFirst };
  organization: {
    findUnique: typeof organizationFindUnique;
    update: typeof organizationUpdate;
  };
  event: { count: typeof eventCount };
  quoteEvent: { create: ReturnType<typeof vi.fn> };
} = {
  quote: {
    updateMany: quoteUpdateMany,
    count: quoteCount,
    findFirst: quoteFindFirst,
    create: txQuoteCreate,
    deleteMany: quoteDeleteMany,
  },
  lineItem: {
    deleteMany: lineItemDeleteMany,
    createMany: lineItemCreateMany,
  },
  estimate: { findFirst: estimateFindFirst },
  organization: {
    findUnique: organizationFindUnique,
    update: organizationUpdate,
  },
  event: { count: eventCount },
  quoteEvent: { create: vi.fn() },
};

const $transaction = vi.fn(
  async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    quote: {
      findMany: quoteFindMany,
      findFirst: quoteFindFirst,
      findUnique: quoteFindUnique,
      create: quoteCreate,
      updateMany: quoteUpdateMany,
      deleteMany: quoteDeleteMany,
    },
    $transaction,
  },
}));

const {
  listQuotes,
  listQuotesForEstimate,
  getQuote,
  createQuote,
  saveQuote,
  deleteQuote,
  QuoteHasEventsError,
  rotateApprovalToken,
  getQuoteByToken,
} = await import("@/lib/repositories/quoteRepo");

beforeEach(() => vi.clearAllMocks());

describe("listQuotes", () => {
  it("scopes by orgId", async () => {
    quoteFindMany.mockResolvedValue([]);
    await listQuotes("org1");
    expect(quoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });
});

describe("listQuotesForEstimate", () => {
  it("scopes by orgId and estimateId", async () => {
    quoteFindMany.mockResolvedValue([]);
    await listQuotesForEstimate(42, "org1");
    expect(quoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1", estimateId: 42 },
      })
    );
  });
});

describe("getQuote", () => {
  it("includes estimate with customer + rooms and line items", async () => {
    quoteFindFirst.mockResolvedValue(null);
    await getQuote(1, "org1");
    expect(quoteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1" },
        include: expect.objectContaining({
          estimate: expect.objectContaining({
            include: expect.objectContaining({
              customer: true,
              items: { orderBy: { sortOrder: "asc" } },
            }),
          }),
          lineItems: { orderBy: { sortOrder: "asc" } },
        }),
      })
    );
  });
});

describe("createQuote", () => {
  it("returns null when the estimate isn't in the org", async () => {
    estimateFindFirst.mockResolvedValue(null);
    const result = await createQuote("org1", { estimateId: 99 });
    expect(result).toBeNull();
    expect(txQuoteCreate).not.toHaveBeenCalled();
  });

  it("allocates the next quoteNumber from Organization.nextQuoteNumber", async () => {
    estimateFindFirst.mockResolvedValue({ id: 1 });
    organizationFindUnique.mockResolvedValue({ nextQuoteNumber: 5005 });
    organizationUpdate.mockResolvedValue({});
    txQuoteCreate.mockResolvedValue({ id: 100, quoteNumber: 5005 });
    quoteFindFirst.mockResolvedValue({ id: 100 });

    await createQuote("org1", { estimateId: 1 });

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextQuoteNumber: 5006 },
    });
    expect(txQuoteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        estimateId: 1,
        quoteNumber: 5005,
        status: "draft",
        taxRate: 0.08,
        markupPct: 0,
        depositPct: 0.5,
      }),
    });
  });
});

describe("saveQuote", () => {
  it("updates only top-level fields when no lineItems provided", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    quoteFindFirst.mockResolvedValue({ id: 1 });

    await saveQuote(1, "org1", { status: "sent" });

    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { status: "sent" },
    });
    expect(lineItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveQuote(99, "org1", { status: "sent" });
    expect(result).toBeNull();
  });

  it("returns null when lineItems-only update targets a nonexistent quote", async () => {
    quoteCount.mockResolvedValue(0);
    const result = await saveQuote(99, "org1", {
      lineItems: [
        {
          name: "Tile",
          rate: 5.4,
          qtyMode: "manual",
          qty: 100,
          unitLabel: "sqft",
          sortOrder: 0,
        },
      ],
    });
    expect(result).toBeNull();
    expect(lineItemDeleteMany).not.toHaveBeenCalled();
  });

  it("replaces line items wholesale when lineItems provided", async () => {
    quoteCount.mockResolvedValue(1);
    quoteFindFirst.mockResolvedValue({ id: 1 });

    await saveQuote(1, "org1", {
      lineItems: [
        {
          name: "Tile",
          rate: 5.4,
          qtyMode: "manual",
          qty: 100,
          unitLabel: "sqft",
          sortOrder: 0,
        },
      ],
    });

    expect(lineItemDeleteMany).toHaveBeenCalledWith({
      where: { quoteId: 1 },
    });
    expect(lineItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quoteId: 1, name: "Tile" })],
    });
  });
});

describe("deleteQuote", () => {
  it("refuses when there are tied events", async () => {
    eventCount.mockResolvedValue(2);
    await expect(deleteQuote(1, "org1")).rejects.toBeInstanceOf(
      QuoteHasEventsError
    );
    expect(quoteDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes when there are no tied events", async () => {
    eventCount.mockResolvedValue(0);
    quoteDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteQuote(1, "org1")).toBe(true);
  });
});

describe("rotateApprovalToken", () => {
  it("returns the token when the quote exists", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const token = await rotateApprovalToken(1, "org1");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { approvalToken: token },
    });
  });

  it("returns null when the quote isn't found", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 0 });
    expect(await rotateApprovalToken(99, "org1")).toBeNull();
  });
});

describe("getQuoteByToken", () => {
  it("looks up by approvalToken with full public view", async () => {
    quoteFindUnique.mockResolvedValue(null);
    await getQuoteByToken("abc123");
    expect(quoteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { approvalToken: "abc123" },
        include: expect.objectContaining({
          estimate: expect.anything(),
          lineItems: expect.anything(),
          org: expect.anything(),
        }),
      })
    );
  });
});

describe("markQuoteSent", () => {
  it("updates Quote send fields and writes a 'sent' event when first send", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "draft", sentAt: null });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const { markQuoteSent } = await import("@/lib/repositories/quoteRepo");
    const eventCreate = vi.fn().mockResolvedValue({ id: 9 });
    txMock.quoteEvent = { create: eventCreate };

    const result = await markQuoteSent(1, "org1", {
      to: "buyer@example.com",
      subject: "Quote #5001 from Acme",
      sentByEmail: "alex@org.com",
      sentByName: "Alex",
    });

    expect(result).toBe(true);
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: {
        status: "sent",
        sentAt: expect.any(Date),
        sentToEmail: "buyer@example.com",
        sentByEmail: "alex@org.com",
        sentByName: "Alex",
      },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 1,
          type: "sent",
          actorEmail: "alex@org.com",
          actorName: "Alex",
          metadata: {
            to: "buyer@example.com",
            subject: "Quote #5001 from Acme",
          },
        }),
      })
    );
  });

  it("writes a 'resent' event when sentAt was already set", async () => {
    quoteFindFirst.mockResolvedValue({
      id: 1,
      status: "viewed",
      sentAt: new Date(),
    });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const { markQuoteSent } = await import("@/lib/repositories/quoteRepo");
    const eventCreate = vi.fn().mockResolvedValue({ id: 10 });
    txMock.quoteEvent = { create: eventCreate };

    await markQuoteSent(1, "org1", {
      to: "buyer@example.com",
      subject: "Resend",
      sentByEmail: "alex@org.com",
      sentByName: "Alex",
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "resent" }),
      })
    );
  });

  it("returns false when quote not in org", async () => {
    quoteFindFirst.mockResolvedValue(null);
    const { markQuoteSent } = await import("@/lib/repositories/quoteRepo");
    const result = await markQuoteSent(99, "org1", {
      to: "x@x.com",
      subject: "x",
      sentByEmail: "a@a.com",
      sentByName: "A",
    });
    expect(result).toBe(false);
  });
});
