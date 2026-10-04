/**
 * Where an estimate's job stands, and the one thing to do next. Pure and
 * client-safe; the estimate page (`components/estimates/EstimateBuilder`)
 * turns `next` into its primary header button and `steps` into the job
 * progress strip shown once the estimate is approved.
 */
import type { EstimateBilling } from "@/lib/invoices";
import { OVERBILL_EPSILON } from "@/lib/invoices";
import { round2 } from "@/lib/money";

export type JobAction =
  | "send"
  | "resend"
  | "bill_deposit"
  | "schedule_job"
  | "bill_balance"
  | "revise";

export type JobStepKey = "deposit" | "schedule" | "final" | "paid";
export type JobStepState = "done" | "current" | "todo";

export interface JobStep {
  key: JobStepKey;
  state: JobStepState;
}

export interface JobProgressInput {
  status: string;
  /** Deposit share the customer saw on the estimate, e.g. 0.3. */
  depositPct: number;
  billing: EstimateBilling;
  /** The estimate's `job` events (visits don't count as the install). */
  jobEvents: ReadonlyArray<{ date: string; endDate?: string | null }>;
  /** Local calendar day, `YYYY-MM-DD`. */
  today: string;
}

export interface JobProgress {
  /** Drives the primary button; null when the job is waiting on nothing the
   *  contractor can do from here. */
  next: JobAction | null;
  /** The deposit in dollars (estimate total × depositPct). */
  depositAmount: number;
  /** First day of the earliest job event; null when unscheduled. */
  jobStart: string | null;
  /** Every job event's last day is before today. */
  jobFinished: boolean;
  /** Approved estimates only (empty otherwise). The deposit step is omitted
   *  when the estimate asks for no deposit. */
  steps: JobStep[];
}

const owes = (n: number) => n > OVERBILL_EPSILON;

export function computeJobProgress(input: JobProgressInput): JobProgress {
  const { billing, jobEvents, today } = input;
  const depositAmount = round2(billing.total * Math.max(0, input.depositPct));
  const days = jobEvents.map((ev) => ({
    start: ev.date.slice(0, 10),
    end: (ev.endDate ?? ev.date).slice(0, 10),
  }));
  const jobStart = days.length > 0 ? days.map((d) => d.start).sort()[0] : null;
  const jobFinished = days.length > 0 && days.every((d) => d.end < today);

  if (input.status !== "approved") {
    const next: JobAction | null =
      input.status === "draft"
        ? "send"
        : input.status === "sent" || input.status === "viewed"
          ? "resend"
          : input.status === "declined"
            ? "revise"
            : null;
    return { next, depositAmount, jobStart, jobFinished, steps: [] };
  }

  const wantsDeposit = owes(depositAmount);
  const nothingBilled = !owes(billing.invoiced);
  const scheduled = days.length > 0;

  let next: JobAction | null = null;
  if (wantsDeposit && nothingBilled && owes(billing.unbilled)) {
    next = "bill_deposit";
  } else if (!scheduled) {
    next = "schedule_job";
  } else if (jobFinished && owes(billing.unbilled)) {
    next = "bill_balance";
  }

  const done: Record<JobStepKey, boolean> = {
    deposit: !owes(depositAmount - billing.paid),
    schedule: scheduled,
    final: !nothingBilled && !owes(billing.unbilled),
    paid:
      !nothingBilled && !owes(billing.unbilled) && !owes(billing.outstanding),
  };
  const keys: JobStepKey[] = wantsDeposit
    ? ["deposit", "schedule", "final", "paid"]
    : ["schedule", "final", "paid"];
  const firstOpen = keys.find((k) => !done[k]);
  const steps = keys.map((key) => ({
    key,
    state: done[key]
      ? ("done" as const)
      : key === firstOpen
        ? ("current" as const)
        : ("todo" as const),
  }));

  return { next, depositAmount, jobStart, jobFinished, steps };
}
