import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EstimateHasEventsError,
  HasInvoicesError,
  ValidationError,
} from "@/lib/api/errors";

const estimateFindMany = vi.fn();
const estimateFindFirst = vi.fn();
const estimateFindUnique = vi.fn();
const estimateCreate = vi.fn();
const txEstimateCreate = vi.fn();
const estimateUpdateMany = vi.fn();
const estimateUpdate = vi.fn();
const estimateDeleteMany = vi.fn();
const estimateCount = vi.fn();
const estimateGroupBy = vi.fn();
const lineItemDeleteMany = vi.fn();
const lineItemCreateMany = vi.fn();
const siteMeasureFindFirst = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();
const eventCount = vi.fn();
const invoiceCount = vi.fn();

const txMock: {
  estimate: {
    updateMany: typeof estimateUpdateMany;
    update: typeof estimateUpdate;
    count: typeof estimateCount;
    findFirst: typeof estimateFindFirst;
    create: typeof txEstimateCreate;
    deleteMany: typeof estimateDeleteMany;
  };
  lineItem: {
    deleteMany: typeof lineItemDeleteMany;
    createMany: typeof lineItemCreateMany;
  };
  siteMeasure: { findFirst: typeof siteMeasureFindFirst };
  organization: {
    findUnique: typeof organizationFindUnique;
    update: typeof organizationUpdate;
  };
  event: { count: typeof eventCount };
  invoice: { count: typeof invoiceCount };
  estimateEvent: { create: ReturnType<typeof vi.fn> };
} = {
  estimate: {
    updateMany: estimateUpdateMany,
    update: estimateUpdate,
    count: estimateCount,
    findFirst: estimateFindFirst,
    create: txEstimateCreate,
    deleteMany: estimateDeleteMany,
  },
  lineItem: {
    deleteMany: lineItemDeleteMany,
    createMany: lineItemCreateMany,
  },
  siteMeasure: { findFirst: siteMeasureFindFirst },
  organization: {
    findUnique: organizationFindUnique,
    update: organizationUpdate,
  },
  event: { count: eventCount },
  invoice: { count: invoiceCount },
  estimateEvent: { create: vi.fn() },
};

const $transaction = vi.fn(
  async (
    arg: ((tx: typeof txMock) => Promise<unknown>) | Promise<unknown>[]
  ) => (Array.isArray(arg) ? Promise.all(arg) : arg(txMock))
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: {
      findMany: estimateFindMany,
      findFirst: estimateFindFirst,
      findUnique: estimateFindUnique,
      create: estimateCreate,
      updateMany: estimateUpdateMany,
      deleteMany: estimateDeleteMany,
      count: estimateCount,
      groupBy: estimateGroupBy,
    },
    $transaction,
  },
}));

const {
  listEstimates,
  listEstimatesForSiteMeasure,
  getEstimate,
  getEstimateForSend,
  createEstimate,
  saveEstimate,
  deleteEstimate,
  rotateApprovalToken,
  estimateHasApprovalToken,
  getEstimateByToken,
} = await import("@/lib/repositories/estimateRepo");

beforeEach(() => vi.clearAllMocks());

describe("listEstimates (paginated)", () => {
  const baseParams = {
    page: 1,
    perPage: 25,
    sort: { key: "date" as const, direction: "desc" as const },
    q: "",
    status: "all" as const,
  };
  function mockGroupBy() {
    estimateGroupBy.mockResolvedValue([
      { status: "draft", _count: { _all: 2 } },
      { status: "approved", _count: { _all: 3 } },
    ]);
  }
  it("scopes by org, applies skip/take and orderBy, returns items+total+facets", async () => {
    estimateFindMany.mockResolvedValue([{ id: 1 }]);
    estimateCount.mockResolvedValue(7);
    mockGroupBy();
    const res = await listEstimates("org1", {
      ...baseParams,
      page: 2,
      perPage: 25,
    });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { date: "desc" },
        skip: 25,
        take: 25,
      })
    );
    expect(res.total).toBe(7);
    expect(res.items).toEqual([{ id: 1 }]);
    expect(res.facets).toEqual({
      all: 5,
      draft: 2,
      sent: 0,
      viewed: 0,
      approved: 3,
      declined: 0,
    });
  });

  it("filters to one customer's estimates when customerId is given", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", { ...baseParams, customerId: 42 });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          AND: [{ siteMeasure: { location: { customerId: 42 } } }],
        },
      })
    );
  });

  it("never selects approvalToken — CWE-201/522: it's the estimate-review bearer token", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", baseParams);
    const call = estimateFindMany.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(call.select).not.toHaveProperty("approvalToken");
    expect(call.select).not.toHaveProperty("lineItems");
    expect(call.select.siteMeasure).toHaveProperty("select");
    expect(
      (call.select.siteMeasure as { select: object }).select
    ).not.toHaveProperty("items");
  });

  it("filters by status when not 'all'", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", { ...baseParams, status: "approved" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1", status: "approved" },
      })
    );
  });

  it("filters viewed rows and includes them in the named facet and all count", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(2);
    estimateGroupBy.mockResolvedValue([
      { status: "viewed", _count: { _all: 2 } },
      { status: "sent", _count: { _all: 1 } },
    ]);
    const result = await listEstimates("org1", {
      ...baseParams,
      status: "viewed",
    });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1", status: "viewed" },
      })
    );
    expect(result.facets).toMatchObject({ all: 3, viewed: 2, sent: 1 });
  });

  it("maps the customer sort key to the nested relation orderBy", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", {
      ...baseParams,
      sort: { key: "customer", direction: "asc" },
    });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { siteMeasure: { location: { customer: { name: "asc" } } } },
      })
    );
  });

  it("omits the estimateNumber clause when query overflows Int32", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", { ...baseParams, q: "99999999999" });
    const call = estimateFindMany.mock.calls[0][0] as {
      where: { OR?: unknown[] };
    };
    const or = call.where.OR;
    expect(or).toHaveLength(1);
    expect(or?.[0]).not.toHaveProperty("estimateNumber");
  });

  it("searches customer name (contains) and exact estimate number for numeric q", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    mockGroupBy();
    await listEstimates("org1", { ...baseParams, q: "#5001" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org1",
          OR: [
            {
              siteMeasure: {
                location: {
                  customer: { name: { contains: "5001", mode: "insensitive" } },
                },
              },
            },
            { estimateNumber: 5001 },
          ],
        }),
      })
    );
  });
});

describe("listEstimatesForSiteMeasure", () => {
  it("scopes by orgId and siteMeasureId", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listEstimatesForSiteMeasure(42, "org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1", siteMeasureId: 42 },
        take: 500,
      })
    );
  });
});

describe("getEstimate", () => {
  it("selects siteMeasure with location.customer + rooms and line items", async () => {
    estimateFindFirst.mockResolvedValue(null);
    await getEstimate(1, "org1");
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1" },
        select: expect.objectContaining({
          siteMeasure: expect.objectContaining({
            include: expect.objectContaining({
              location: { include: { customer: true } },
              items: { orderBy: { sortOrder: "asc" } },
            }),
          }),
          lineItems: { orderBy: { sortOrder: "asc" } },
        }),
      })
    );
  });

  it("never selects approvalToken — CWE-201/522: it's the estimate-review bearer token", async () => {
    estimateFindFirst.mockResolvedValue(null);
    await getEstimate(1, "org1");
    const call = estimateFindFirst.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(call.select).not.toHaveProperty("approvalToken");
  });
});

describe("getEstimateForSend", () => {
  it("does select approvalToken — server-only, feeds the send pipeline", async () => {
    estimateFindFirst.mockResolvedValue(null);
    await getEstimateForSend(1, "org1");
    const call = estimateFindFirst.mock.calls[0][0] as {
      where: unknown;
      include: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: 1, orgId: "org1" });
    // Plain `include` on the top level returns every scalar (including
    // approvalToken) by construction — no explicit key to assert on, but
    // this pins the include-vs-select choice against an accidental switch.
    expect(call).toHaveProperty("include");
    expect(call).not.toHaveProperty("select");
  });
});

describe("createEstimate", () => {
  it("returns null when the siteMeasure isn't in the org", async () => {
    siteMeasureFindFirst.mockResolvedValue(null);
    const result = await createEstimate("org1", { siteMeasureId: 99 });
    expect(result).toBeNull();
    expect(txEstimateCreate).not.toHaveBeenCalled();
  });

  it("atomically allocates the next estimateNumber via an increment-returning update", async () => {
    siteMeasureFindFirst.mockResolvedValue({ id: 1 });
    // The atomic increment returns the post-increment counter; the reserved
    // number is that value minus one.
    organizationUpdate.mockResolvedValue({
      nextEstimateNumber: 5006,
      defaultDepositPct: 0.3,
      defaultTerms: "",
      defaultValidityDays: 21,
    });
    txEstimateCreate.mockResolvedValue({ id: 100, estimateNumber: 5005 });
    estimateFindFirst.mockResolvedValue({ id: 100 });

    await createEstimate("org1", { siteMeasureId: 1 });

    // Must not read the counter via a non-locking findUnique (issue #159).
    expect(organizationFindUnique).not.toHaveBeenCalled();
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextEstimateNumber: { increment: 1 } },
      select: {
        nextEstimateNumber: true,
        defaultDepositPct: true,
        defaultTerms: true,
        defaultValidityDays: true,
      },
    });
    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        siteMeasureId: 1,
        estimateNumber: 5005,
        status: "draft",
        markupPct: 0,
        depositPct: 0.3,
        terms: "",
        validityDays: 21,
      }),
    });
  });
});

describe("createEstimate — org defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    siteMeasureFindFirst.mockResolvedValue({ id: 7 });
    organizationUpdate.mockResolvedValue({
      nextEstimateNumber: 1043,
      defaultDepositPct: 0.4,
      defaultTerms: "Custom terms text.",
      defaultValidityDays: 30,
    });
    txEstimateCreate.mockResolvedValue({ id: 999 });
    estimateFindFirst.mockResolvedValue({ id: 999 });
  });

  it("copies depositPct, terms, validityDays from the org onto the new estimate", async () => {
    await createEstimate("org1", { siteMeasureId: 7 });
    expect(txEstimateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          depositPct: 0.4,
          terms: "Custom terms text.",
          validityDays: 30,
        }),
      })
    );
  });
});

describe("saveEstimate", () => {
  it("updates only top-level fields when no lineItems provided", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({
      id: 1,
      markupPct: 0,
      depositPct: 0.3,
      lineItems: [],
      siteMeasure: { items: [] },
    });

    await saveEstimate(1, "org1", { status: "sent" });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { status: "sent" },
    });
    expect(lineItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveEstimate(99, "org1", { status: "sent" });
    expect(result).toBeNull();
  });

  it("returns null when lineItems-only update targets a nonexistent estimate", async () => {
    estimateCount.mockResolvedValue(0);
    const result = await saveEstimate(99, "org1", {
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
    estimateCount.mockResolvedValue(1);
    estimateFindFirst.mockResolvedValue({
      id: 1,
      markupPct: 0,
      depositPct: 0.3,
      lineItems: [],
      siteMeasure: { items: [] },
    });

    await saveEstimate(1, "org1", {
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
      where: { estimateId: 1 },
    });
    expect(lineItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ estimateId: 1, name: "Tile" })],
    });
  });

  // Issue #288: approval/decline must go exclusively through
  // approveEstimateByToken / declineEstimateByToken, which write the
  // EstimateApproval consent row and run the supersede-siblings logic — a
  // plain status flip through saveEstimate would skip both. This guards the
  // repo layer (the trust boundary) even though EstimatePatch's TS type
  // already excludes these values, in case a caller bypasses the type.
  it.each([
    "approved",
    "declined",
  ] as const)("rejects a direct status=%s patch with ValidationError and does not touch the DB", async (status) => {
    // Simulate a caller that bypasses EstimatePatch's TS type (e.g. an
    // untyped JSON body) — the repo must still refuse this at runtime.
    const patch = { status } as unknown as Parameters<typeof saveEstimate>[2];
    await expect(saveEstimate(1, "org1", patch)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect($transaction).not.toHaveBeenCalled();
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });
});

describe("saveEstimate — total denormalization", () => {
  it("recomputes and stores total from line items after save", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({
      id: 1,
      markupPct: 0,
      depositPct: 0.3,
      lineItems: [
        {
          id: 1,
          name: "Tile",
          rate: 10,
          qtyMode: "manual",
          qty: 5,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
      siteMeasure: { items: [] },
    });

    await saveEstimate(1, "org1", { markupPct: 0 });

    expect(estimateUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { total: 50 },
    });
  });

  it("stores null total when the estimate has no line items", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({
      id: 1,
      markupPct: 0,
      depositPct: 0.3,
      lineItems: [],
      siteMeasure: { items: [] },
    });

    await saveEstimate(1, "org1", { markupPct: 0 });

    expect(estimateUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { total: null },
    });
  });
});

describe("deleteEstimate", () => {
  it("refuses when there are tied events", async () => {
    eventCount.mockResolvedValue(2);
    await expect(deleteEstimate(1, "org1")).rejects.toBeInstanceOf(
      EstimateHasEventsError
    );
    expect(estimateDeleteMany).not.toHaveBeenCalled();
  });

  it("refuses when there are invoices (cascade would erase the payment ledger)", async () => {
    eventCount.mockResolvedValue(0);
    invoiceCount.mockResolvedValue(2);
    await expect(deleteEstimate(1, "org1")).rejects.toBeInstanceOf(
      HasInvoicesError
    );
    expect(invoiceCount).toHaveBeenCalledWith({
      where: { orgId: "org1", estimateId: 1 },
    });
    expect(estimateDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes when there are no tied events or invoices", async () => {
    eventCount.mockResolvedValue(0);
    invoiceCount.mockResolvedValue(0);
    estimateDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEstimate(1, "org1")).toBe(true);
  });
});

describe("rotateApprovalToken", () => {
  it("returns the token when the estimate exists", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const token = await rotateApprovalToken(1, "org1");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { approvalToken: token },
    });
  });

  it("returns null when the estimate isn't found", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    expect(await rotateApprovalToken(99, "org1")).toBeNull();
  });
});

describe("estimateHasApprovalToken", () => {
  it("collapses a present token to true without returning it", async () => {
    estimateFindFirst.mockResolvedValue({ approvalToken: "secret" });
    expect(await estimateHasApprovalToken(1, "org1")).toBe(true);
    expect(estimateFindFirst).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      select: { approvalToken: true },
    });
  });

  it("returns false when there's no token, or the estimate isn't in the org", async () => {
    estimateFindFirst.mockResolvedValue({ approvalToken: null });
    expect(await estimateHasApprovalToken(1, "org1")).toBe(false);
    estimateFindFirst.mockResolvedValue(null);
    expect(await estimateHasApprovalToken(99, "org1")).toBe(false);
  });
});

describe("getEstimateByToken", () => {
  it("looks up by approvalToken with full public view", async () => {
    estimateFindUnique.mockResolvedValue(null);
    await getEstimateByToken("abc123");
    expect(estimateFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { approvalToken: "abc123" },
        include: expect.objectContaining({
          siteMeasure: expect.anything(),
          lineItems: expect.anything(),
          org: expect.anything(),
        }),
      })
    );
  });
});

describe("markEstimateSent", () => {
  it("updates Estimate send fields and writes a 'sent' event when first send", async () => {
    estimateFindFirst.mockResolvedValue({
      id: 1,
      status: "draft",
      sentAt: null,
    });
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const { markEstimateSent } = await import(
      "@/lib/repositories/estimateRepo"
    );
    const eventCreate = vi.fn().mockResolvedValue({ id: 9 });
    txMock.estimateEvent = { create: eventCreate };

    const result = await markEstimateSent(1, "org1", {
      to: "buyer@example.com",
      subject: "Estimate #5001 from Acme",
      sentByEmail: "alex@org.com",
      sentByName: "Alex",
    });

    expect(result).toBe(true);
    expect(estimateUpdateMany).toHaveBeenCalledWith({
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
          estimateId: 1,
          type: "sent",
          actorEmail: "alex@org.com",
          actorName: "Alex",
          metadata: {
            to: "buyer@example.com",
            subject: "Estimate #5001 from Acme",
          },
        }),
      })
    );
  });

  it("writes a 'resent' event when sentAt was already set", async () => {
    estimateFindFirst.mockResolvedValue({
      id: 1,
      status: "viewed",
      sentAt: new Date(),
    });
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const { markEstimateSent } = await import(
      "@/lib/repositories/estimateRepo"
    );
    const eventCreate = vi.fn().mockResolvedValue({ id: 10 });
    txMock.estimateEvent = { create: eventCreate };

    await markEstimateSent(1, "org1", {
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

  it("returns false when estimate not in org", async () => {
    estimateFindFirst.mockResolvedValue(null);
    const { markEstimateSent } = await import(
      "@/lib/repositories/estimateRepo"
    );
    const result = await markEstimateSent(99, "org1", {
      to: "x@x.com",
      subject: "x",
      sentByEmail: "a@a.com",
      sentByName: "A",
    });
    expect(result).toBe(false);
  });
});

describe("markEstimateViewed", () => {
  it("flips sent → viewed and writes a viewed event", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const eventCreate = vi.fn().mockResolvedValue({ id: 5 });
    txMock.estimateEvent = { create: eventCreate };
    estimateFindFirst.mockResolvedValue({ id: 1, status: "sent" });
    const { markEstimateViewed } = await import(
      "@/lib/repositories/estimateRepo"
    );

    await markEstimateViewed(1, "org1", { ip: "1.2.3.4", userAgent: "UA" });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1", status: "sent" },
      data: { status: "viewed", viewedAt: expect.any(Date) },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimateId: 1,
          type: "viewed",
          ip: "1.2.3.4",
          userAgent: "UA",
        }),
      })
    );
  });

  it("writes only an event (no status update) when status is already viewed", async () => {
    estimateFindFirst.mockResolvedValue({ id: 1, status: "viewed" });
    const eventCreate = vi.fn();
    txMock.estimateEvent = { create: eventCreate };
    const { markEstimateViewed } = await import(
      "@/lib/repositories/estimateRepo"
    );
    await markEstimateViewed(1, "org1", { ip: null, userAgent: null });
    expect(estimateUpdateMany).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalled();
  });

  it("does nothing when status is approved or declined", async () => {
    const eventCreate = vi.fn();
    txMock.estimateEvent = { create: eventCreate };
    estimateFindFirst.mockResolvedValue({ id: 1, status: "approved" });
    const { markEstimateViewed } = await import(
      "@/lib/repositories/estimateRepo"
    );
    await markEstimateViewed(1, "org1", { ip: null, userAgent: null });
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe("declineEstimateByToken", () => {
  it("flips draft|sent|viewed → declined and writes event", async () => {
    estimateFindFirst.mockResolvedValue({ id: 1, status: "viewed" });
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const eventCreate = vi.fn();
    txMock.estimateEvent = { create: eventCreate };
    const { declineEstimateByToken } = await import(
      "@/lib/repositories/estimateRepo"
    );

    const result = await declineEstimateByToken(1, {
      reason: "went with another vendor",
      ip: "1.2.3.4",
      userAgent: "UA",
    });
    expect(result).toBe("ok");
    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, status: { in: ["draft", "sent", "viewed"] } },
      data: {
        status: "declined",
        declinedAt: expect.any(Date),
        declineReason: "went with another vendor",
      },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "declined",
          metadata: { reason: "went with another vendor" },
        }),
      })
    );
  });

  it("returns 'already_approved' on approved; 'already_declined' on declined", async () => {
    estimateFindFirst.mockResolvedValueOnce({ id: 1, status: "approved" });
    let r = await (
      await import("@/lib/repositories/estimateRepo")
    ).declineEstimateByToken(1, { reason: null, ip: null, userAgent: null });
    expect(r).toBe("already_approved");
    estimateFindFirst.mockResolvedValueOnce({ id: 1, status: "declined" });
    r = await (
      await import("@/lib/repositories/estimateRepo")
    ).declineEstimateByToken(1, { reason: null, ip: null, userAgent: null });
    expect(r).toBe("already_declined");
  });
});
