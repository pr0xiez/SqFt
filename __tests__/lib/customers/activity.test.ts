import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ActivityInvoice,
  buildCustomerTimeline,
  type CustomerActivity,
  summarizeCustomerActivity,
  upcomingEvents,
} from "@/lib/customers/activity";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

function invoice(over: Partial<ActivityInvoice> = {}): ActivityInvoice {
  return {
    id: 1,
    invoiceNumber: 7001,
    estimateId: 10,
    estimateNumber: 5010,
    status: "sent",
    amount: 300,
    dueDate: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    payments: [],
    events: [],
    ...over,
  };
}

function activity(over: Partial<CustomerActivity> = {}): CustomerActivity {
  return {
    customerCreatedAt: "2026-09-01T10:00:00.000Z",
    siteMeasures: [],
    estimates: [],
    invoices: [],
    events: [],
    ...over,
  };
}

describe("summarizeCustomerActivity", () => {
  it("counts open, approved and declined estimates with their value", () => {
    const s = summarizeCustomerActivity({
      estimates: [
        { status: "sent", total: 1200 },
        { status: "viewed", total: null },
        { status: "approved", total: 3000.5 },
        { status: "declined", total: 900 },
        { status: "draft", total: 400 },
      ],
      invoices: [],
    });
    expect(s).toMatchObject({
      openCount: 2,
      openValue: 1200,
      approvedCount: 1,
      approvedValue: 3000.5,
      declinedCount: 1,
    });
  });

  it("owes only sent, unpaid invoices; drafts and voids aren't due", () => {
    const s = summarizeCustomerActivity({
      estimates: [],
      invoices: [
        invoice({
          id: 1,
          status: "partial",
          amount: 500,
          payments: [
            {
              id: 1,
              amount: 200,
              method: "check",
              paidAt: "2026-09-21T00:00:00.000Z",
            },
          ],
        }),
        invoice({ id: 2, status: "draft", amount: 700 }),
        invoice({ id: 3, status: "void", amount: 999 }),
        invoice({
          id: 4,
          status: "paid",
          amount: 100,
          payments: [
            {
              id: 2,
              amount: 100,
              method: "cash",
              paidAt: "2026-09-22T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    expect(s.invoiced).toBe(1300); // void excluded, draft included
    expect(s.paid).toBe(300);
    expect(s.balanceDue).toBe(300);
    expect(s.overdueCount).toBe(0);
  });

  it("counts overdue invoices", () => {
    const s = summarizeCustomerActivity({
      estimates: [],
      invoices: [invoice({ dueDate: "2026-09-30T00:00:00.000Z" })],
    });
    expect(s.overdueCount).toBe(1);
    expect(s.balanceDue).toBe(300);
  });
});

describe("upcomingEvents", () => {
  const ev = (id: number, date: string, endDate: string | null = null) => ({
    id,
    type: "visit",
    title: `E${id}`,
    date,
    endDate,
    startTime: "09:00",
    endTime: "10:00",
    estimateId: null,
    estimateNumber: null,
    assignees: [],
  });

  it("keeps today and later (including multi-day events still running), soonest first", () => {
    const out = upcomingEvents(
      [
        ev(1, "2026-10-09T00:00:00.000Z"),
        ev(2, "2026-10-01T00:00:00.000Z"),
        ev(3, "2026-10-02T00:00:00.000Z", "2026-10-05T00:00:00.000Z"),
        ev(4, "2026-10-04T00:00:00.000Z"),
      ],
      "2026-10-04"
    );
    expect(out.map((e) => e.id)).toEqual([3, 4, 1]);
  });
});

describe("buildCustomerTimeline", () => {
  const data = activity({
    siteMeasures: [
      {
        id: 3,
        siteMeasureNumber: 1003,
        createdAt: "2026-09-02T10:00:00.000Z",
        address: "1 Main St",
      },
    ],
    estimates: [
      {
        id: 10,
        estimateNumber: 5010,
        siteMeasureId: 3,
        status: "approved",
        total: 1000,
        createdAt: "2026-09-03T10:00:00.000Z",
        events: [
          {
            id: 1,
            type: "sent",
            source: "builder",
            createdAt: "2026-09-04T10:00:00.000Z",
            to: "a@b.co",
            reason: null,
            relatedEstimateNumber: null,
          },
          {
            id: 2,
            type: "viewed",
            source: "customer",
            createdAt: "2026-09-05T10:00:00.000Z",
            to: null,
            reason: null,
            relatedEstimateNumber: null,
          },
          {
            id: 3,
            type: "viewed",
            source: "customer",
            createdAt: "2026-09-06T10:00:00.000Z",
            to: null,
            reason: null,
            relatedEstimateNumber: null,
          },
          {
            id: 4,
            type: "approved",
            source: "customer",
            createdAt: "2026-09-07T10:00:00.000Z",
            to: null,
            reason: null,
            relatedEstimateNumber: null,
          },
        ],
      },
      {
        id: 11,
        estimateNumber: 5011,
        siteMeasureId: 3,
        status: "declined",
        total: 1200,
        createdAt: "2026-09-03T11:00:00.000Z",
        events: [
          {
            id: 5,
            type: "declined",
            source: "system_supersede",
            createdAt: "2026-09-07T10:00:01.000Z",
            to: null,
            reason: null,
            relatedEstimateNumber: 5010,
          },
        ],
      },
    ],
    invoices: [
      invoice({
        id: 1,
        status: "paid",
        createdAt: "2026-09-08T10:00:00.000Z",
        payments: [
          {
            id: 9,
            amount: 300,
            method: "check",
            paidAt: "2026-09-10T10:00:00.000Z",
          },
        ],
        events: [
          {
            id: 6,
            type: "sent",
            createdAt: "2026-09-08T11:00:00.000Z",
            to: "a@b.co",
          },
        ],
      }),
    ],
    events: [
      {
        id: 20,
        type: "job",
        title: "Install: Jo",
        date: "2026-09-15T00:00:00.000Z",
        endDate: null,
        startTime: "08:00",
        endTime: "17:00",
        estimateId: 10,
        estimateNumber: 5010,
        assignees: [{ id: "u1", name: "Sam" }],
      },
      {
        id: 21,
        type: "visit",
        title: "Walkthrough",
        date: "2026-10-20T00:00:00.000Z",
        endDate: null,
        startTime: "09:00",
        endTime: "10:00",
        estimateId: null,
        estimateNumber: null,
        assignees: [],
      },
    ],
  });
  const timeline = buildCustomerTimeline(data, "2026-10-04");
  const titles = timeline.map((e) => e.title);

  it("orders everything newest first, starting from intake", () => {
    expect(titles[0]).toBe("Install: Jo");
    expect(titles.at(-1)).toBe("Customer added");
    const times = timeline.map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("covers the whole chain with links to each record", () => {
    expect(
      timeline.find((e) => e.title === "Site measure #1003 started")
    ).toMatchObject({ href: "/site-measures/3", detail: "1 Main St" });
    expect(
      timeline.find((e) => e.title === "Estimate #5010 sent")
    ).toMatchObject({ href: "/estimates/10", detail: "To a@b.co" });
    expect(
      timeline.find((e) => e.title === "Estimate #5010 approved")
    ).toMatchObject({ amount: 1000, tone: "ok", kind: "approved" });
    expect(
      timeline.find((e) => e.title === "Invoice #7001 drafted")
    ).toMatchObject({ href: "/invoices/1", amount: 300 });
    expect(timeline.find((e) => e.title === "Payment received")).toMatchObject({
      amount: 300,
      detail: "Check, invoice #7001",
    });
  });

  it("collapses repeat opens into the first view", () => {
    const views = timeline.filter((e) => e.title === "Estimate #5010 viewed");
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      at: "2026-09-05T10:00:00.000Z",
      detail: "Opened 2 times",
    });
  });

  it("explains an auto-declined sibling instead of calling it a customer decline", () => {
    expect(
      timeline.find((e) => e.title === "Estimate #5011 closed")
    ).toMatchObject({
      detail: "Estimate #5010 was approved instead",
      tone: "default",
    });
    expect(titles).not.toContain("Estimate #5011 declined");
  });

  it("includes past schedule events and leaves upcoming ones out", () => {
    expect(timeline.find((e) => e.title === "Install: Jo")).toMatchObject({
      href: "/schedule?date=2026-09-15",
      detail: "Job, Sam",
      kind: "event",
    });
    expect(titles).not.toContain("Walkthrough");
  });
});
