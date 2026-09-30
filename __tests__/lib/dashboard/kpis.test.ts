import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const siteMeasureCount = vi.fn();
const estimateCount = vi.fn();
const estimateFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteMeasure: { count: siteMeasureCount },
    estimate: { count: estimateCount, findMany: estimateFindMany },
  },
}));

const { getDashboardKpis } = await import("@/lib/dashboard/kpis");

// Mon Jun 15 2026, noon local — fixed so window math (weekAgo, monthStart,
// expiring-soon, etc.) is deterministic instead of depending on real "now".
const FAKE_NOW = new Date(2026, 5, 15, 12, 0, 0, 0);

function daysFromNow(n: number): Date {
  return new Date(FAKE_NOW.getTime() + n * 24 * 60 * 60 * 1000);
}

interface RevenueRowOpts {
  rate: number;
  qty: number;
  markupPct?: number;
  depositPct?: number;
}

/** Minimal row shaped like the `revenueSelect` Prisma read — enough for
 *  `fromPrismaEstimate` + `computeEstimateView` to roll up a total. */
function makeRevenueRow({
  rate,
  qty,
  markupPct = 0,
  depositPct = 0.3,
}: RevenueRowOpts) {
  return {
    markupPct,
    depositPct,
    lineItems: [
      {
        id: 1,
        name: "Flooring",
        description: null,
        rate,
        qtyMode: "manual",
        qty,
        wastePct: 0,
        unitLabel: "sqft",
        linkedRoomIds: [],
        sortOrder: 0,
      },
    ],
    siteMeasure: { items: [] },
  };
}

interface QueryOpts {
  siteMeasureTotal?: number;
  siteMeasureThisWeek?: number;
  siteMeasureLastWeek?: number;
  sentTotal?: number;
  sentThisWeek?: number;
  sentLastWeek?: number;
  awaiting?: Array<{ id: number; sentAt: Date | null; validityDays: number }>;
  won30d?: number;
  lost30d?: number;
  won60to30d?: number;
  lost60to30d?: number;
  acceptedMtd?: unknown[];
  acceptedLastMonthSamePeriod?: unknown[];
}

/** Wires up the 13 `Promise.all` queries `getDashboardKpis` issues, in the
 *  exact order the source array lists them (siteMeasure.count ×3,
 *  estimate.count ×7, estimate.findMany ×3) — since those calls happen
 *  synchronously before any await, `mockResolvedValueOnce` chains line up
 *  with call order regardless of interleaving between the three mocks. */
function mockQueries(opts: QueryOpts) {
  const {
    siteMeasureTotal = 0,
    siteMeasureThisWeek = 0,
    siteMeasureLastWeek = 0,
    sentTotal = 0,
    sentThisWeek = 0,
    sentLastWeek = 0,
    awaiting = [],
    won30d = 0,
    lost30d = 0,
    won60to30d = 0,
    lost60to30d = 0,
    acceptedMtd = [],
    acceptedLastMonthSamePeriod = [],
  } = opts;

  siteMeasureCount
    .mockResolvedValueOnce(siteMeasureTotal)
    .mockResolvedValueOnce(siteMeasureThisWeek)
    .mockResolvedValueOnce(siteMeasureLastWeek);

  estimateCount
    .mockResolvedValueOnce(sentTotal)
    .mockResolvedValueOnce(sentThisWeek)
    .mockResolvedValueOnce(sentLastWeek)
    .mockResolvedValueOnce(won30d)
    .mockResolvedValueOnce(lost30d)
    .mockResolvedValueOnce(won60to30d)
    .mockResolvedValueOnce(lost60to30d);

  estimateFindMany
    .mockResolvedValueOnce(awaiting)
    .mockResolvedValueOnce(acceptedMtd)
    .mockResolvedValueOnce(acceptedLastMonthSamePeriod);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getDashboardKpis", () => {
  it("computes site-measure and sent-estimate totals with week-over-week deltas", async () => {
    mockQueries({
      siteMeasureTotal: 25,
      siteMeasureThisWeek: 5,
      siteMeasureLastWeek: 3,
      sentTotal: 14,
      sentThisWeek: 4,
      sentLastWeek: 1,
    });

    const result = await getDashboardKpis("org1");

    expect(result.estimatesTotal).toBe(25);
    expect(result.estimatesDelta).toBe(2);
    expect(result.estimatesSentTotal).toBe(14);
    expect(result.estimatesSentDelta).toBe(3);
  });

  it("supports a negative delta when this week trails last week", async () => {
    mockQueries({
      siteMeasureThisWeek: 2,
      siteMeasureLastWeek: 6,
      sentThisWeek: 1,
      sentLastWeek: 5,
    });

    const result = await getDashboardKpis("org1");

    expect(result.estimatesDelta).toBe(-4);
    expect(result.estimatesSentDelta).toBe(-4);
  });

  it("counts awaitingSignature and buckets expiringSoonCount within the next 7 days", async () => {
    const awaiting = [
      // sentAt + validityDays = Jun 16 12:00 -> within now+7d (Jun 22 12:00)
      { id: 1, sentAt: daysFromNow(-20), validityDays: 21 },
      // sentAt + validityDays = Jul 10 12:00 -> not within the 7-day window
      { id: 2, sentAt: daysFromNow(-5), validityDays: 30 },
      // never sent -> counted as awaiting a signature but excluded from
      // expiringSoonCount (no sentAt to compute an expiry from)
      { id: 3, sentAt: null, validityDays: 14 },
      // sentAt + validityDays = Jun 21 12:00 -> within the 7-day window
      { id: 4, sentAt: daysFromNow(-1), validityDays: 7 },
    ];
    mockQueries({ awaiting });

    const result = await getDashboardKpis("org1");

    expect(result.awaitingSignature).toBe(4);
    expect(result.expiringSoonCount).toBe(2);
  });

  it("returns zero awaitingSignature/expiringSoonCount when nothing is outstanding", async () => {
    mockQueries({ awaiting: [] });

    const result = await getDashboardKpis("org1");

    expect(result.awaitingSignature).toBe(0);
    expect(result.expiringSoonCount).toBe(0);
  });

  it("computes winRate30d and winRateDelta from won/lost counts in the trailing windows", async () => {
    mockQueries({ won30d: 6, lost30d: 4, won60to30d: 3, lost60to30d: 7 });

    const result = await getDashboardKpis("org1");

    // 6/(6+4) = 60%; previous window 3/(3+7) = 30%; delta = 60 - 30
    expect(result.winRate30d).toBe(60);
    expect(result.winRateDelta).toBe(30);
  });

  it("returns winRate30d 0 (not NaN) when there is no decided estimate in either window", async () => {
    mockQueries({ won30d: 0, lost30d: 0, won60to30d: 0, lost60to30d: 0 });

    const result = await getDashboardKpis("org1");

    expect(result.winRate30d).toBe(0);
    expect(result.winRateDelta).toBe(0);
  });

  it("handles a zero denominator in only the previous window", async () => {
    mockQueries({ won30d: 2, lost30d: 2, won60to30d: 0, lost60to30d: 0 });

    const result = await getDashboardKpis("org1");

    expect(result.winRate30d).toBe(50);
    // previous-window rate falls back to 0 with no decided estimates
    expect(result.winRateDelta).toBe(50);
  });

  it("rolls up bookedRevenueMtd and its delta via computeEstimateView totals", async () => {
    mockQueries({
      acceptedMtd: [
        makeRevenueRow({ rate: 5, qty: 200, markupPct: 10 }), // 1000 + 10% = 1100
        makeRevenueRow({ rate: 10, qty: 50 }), // 500
      ],
      acceptedLastMonthSamePeriod: [
        makeRevenueRow({ rate: 4, qty: 100 }), // 400
      ],
    });

    const result = await getDashboardKpis("org1");

    expect(result.bookedRevenueMtd).toBe(1600);
    expect(result.bookedRevenueDelta).toBe(1200);
  });

  it("returns zero bookedRevenue figures with no approved estimates in either window", async () => {
    mockQueries({ acceptedMtd: [], acceptedLastMonthSamePeriod: [] });

    const result = await getDashboardKpis("org1");

    expect(result.bookedRevenueMtd).toBe(0);
    expect(result.bookedRevenueDelta).toBe(0);
  });

  it("allows bookedRevenueDelta to go negative when this month trails last month's same period", async () => {
    mockQueries({
      acceptedMtd: [makeRevenueRow({ rate: 1, qty: 100 })], // 100
      acceptedLastMonthSamePeriod: [makeRevenueRow({ rate: 1, qty: 900 })], // 900
    });

    const result = await getDashboardKpis("org1");

    expect(result.bookedRevenueMtd).toBe(100);
    expect(result.bookedRevenueDelta).toBe(-800);
  });
});
