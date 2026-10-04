import { describe, expect, it } from "vitest";
import {
  computeJobProgress,
  type JobProgressInput,
} from "@/lib/estimates/jobProgress";
import { computeEstimateBilling } from "@/lib/invoices";

const TODAY = "2026-10-04";

/** A $1,000 estimate with a 30% deposit and the given invoices. */
function input(
  over: Partial<JobProgressInput> & {
    invoices?: { amount: number; status: string; paidAmount: number }[];
  } = {}
): JobProgressInput {
  const { invoices = [], ...rest } = over;
  return {
    status: "approved",
    depositPct: 0.3,
    billing: computeEstimateBilling(1000, invoices),
    jobEvents: [],
    today: TODAY,
    ...rest,
  };
}

const keysAndStates = (p: ReturnType<typeof computeJobProgress>) =>
  p.steps.map((s) => `${s.key}:${s.state}`);

describe("computeJobProgress — before approval", () => {
  it.each([
    ["draft", "send"],
    ["sent", "resend"],
    ["viewed", "resend"],
    ["declined", "revise"],
  ])("%s → %s, with no job steps", (status, next) => {
    const p = computeJobProgress(input({ status }));
    expect(p.next).toBe(next);
    expect(p.steps).toEqual([]);
  });
});

describe("computeJobProgress — approved", () => {
  it("bills the deposit first, sized from the estimate's depositPct", () => {
    const p = computeJobProgress(input());
    expect(p.next).toBe("bill_deposit");
    expect(p.depositAmount).toBe(300);
    expect(keysAndStates(p)).toEqual([
      "deposit:current",
      "schedule:todo",
      "final:todo",
      "paid:todo",
    ]);
  });

  it("schedules the job once anything is billed, even before it's paid", () => {
    const p = computeJobProgress(
      input({ invoices: [{ amount: 300, status: "sent", paidAmount: 0 }] })
    );
    expect(p.next).toBe("schedule_job");
    // The deposit step stays current until the money is in.
    expect(p.steps[0]).toEqual({ key: "deposit", state: "current" });
  });

  it("skips the deposit step when the estimate asks for none", () => {
    const p = computeJobProgress(input({ depositPct: 0 }));
    expect(p.next).toBe("schedule_job");
    expect(keysAndStates(p)).toEqual([
      "schedule:current",
      "final:todo",
      "paid:todo",
    ]);
  });

  it("waits (no action) while a booked job is still ahead", () => {
    const p = computeJobProgress(
      input({
        invoices: [{ amount: 300, status: "paid", paidAmount: 300 }],
        jobEvents: [{ date: "2026-10-12T00:00:00.000Z", endDate: null }],
      })
    );
    expect(p.next).toBeNull();
    expect(p.jobStart).toBe("2026-10-12");
    expect(p.jobFinished).toBe(false);
    expect(keysAndStates(p)).toEqual([
      "deposit:done",
      "schedule:done",
      "final:current",
      "paid:todo",
    ]);
  });

  it("treats a multi-day job as running until its last day", () => {
    const p = computeJobProgress(
      input({
        invoices: [{ amount: 300, status: "paid", paidAmount: 300 }],
        jobEvents: [
          {
            date: "2026-10-01T00:00:00.000Z",
            endDate: "2026-10-04T00:00:00.000Z",
          },
        ],
      })
    );
    expect(p.jobFinished).toBe(false);
    expect(p.next).toBeNull();
  });

  it("bills the balance after the install", () => {
    const p = computeJobProgress(
      input({
        invoices: [{ amount: 300, status: "paid", paidAmount: 300 }],
        jobEvents: [{ date: "2026-10-01T00:00:00.000Z" }],
      })
    );
    expect(p.jobFinished).toBe(true);
    expect(p.next).toBe("bill_balance");
  });

  it("is done when everything is billed and paid", () => {
    const p = computeJobProgress(
      input({
        invoices: [
          { amount: 300, status: "paid", paidAmount: 300 },
          { amount: 700, status: "paid", paidAmount: 700 },
        ],
        jobEvents: [{ date: "2026-10-01T00:00:00.000Z" }],
      })
    );
    expect(p.next).toBeNull();
    expect(p.steps.every((s) => s.state === "done")).toBe(true);
  });

  it("ignores void invoices when deciding the deposit is still unbilled", () => {
    const p = computeJobProgress(
      input({ invoices: [{ amount: 300, status: "void", paidAmount: 0 }] })
    );
    expect(p.next).toBe("bill_deposit");
  });
});
