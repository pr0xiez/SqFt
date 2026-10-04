import { fmtDay } from "@/components/schedule/ScheduleEventRows";
import {
  CheckCircleIcon,
  CircleDashedIcon,
  CircleIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { JobProgress, JobStep } from "@/lib/estimates/jobProgress";
import type { EstimateBilling } from "@/lib/invoices";
import { OVERBILL_EPSILON } from "@/lib/invoices";
import { fmtDollar } from "@/lib/utils";

const STEP_LABELS: Record<JobStep["key"], string> = {
  deposit: "Deposit",
  schedule: "Install",
  final: "Final invoice",
  paid: "Paid in full",
};

function stepSub(
  step: JobStep,
  progress: JobProgress,
  billing: EstimateBilling,
  depositPct: number
): string {
  const billed = billing.invoiced > OVERBILL_EPSILON;
  switch (step.key) {
    case "deposit":
      if (step.state === "done")
        return `${fmtDollar(progress.depositAmount)} paid`;
      if (billed) return "Billed, awaiting payment";
      return `${Math.round(depositPct * 100)}%, ${fmtDollar(progress.depositAmount)}`;
    case "schedule":
      if (!progress.jobStart) return "Not scheduled";
      return progress.jobFinished
        ? `Done ${fmtDay(progress.jobStart)}`
        : `Booked for ${fmtDay(progress.jobStart)}`;
    case "final":
      if (step.state === "done") return "Billed in full";
      return `${fmtDollar(billing.unbilled)} to bill`;
    case "paid":
      if (step.state === "done") return "All payments in";
      return billing.outstanding > OVERBILL_EPSILON
        ? `${fmtDollar(billing.outstanding)} due`
        : "Nothing due yet";
  }
}

/**
 * Where an approved job stands: deposit, install, final invoice, paid in
 * full. The current step carries the tape-blade mark; the page's primary
 * button is the action that moves it forward.
 */
export function JobProgressStrip({
  progress,
  billing,
  depositPct,
}: {
  progress: JobProgress;
  billing: EstimateBilling;
  depositPct: number;
}) {
  if (progress.steps.length === 0) return null;
  return (
    <ol
      aria-label="Job progress"
      className={cn(
        "card grid grid-cols-2 overflow-hidden mb-6",
        progress.steps.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"
      )}
    >
      {progress.steps.map((step, i) => {
        const Icon =
          step.state === "done"
            ? CheckCircleIcon
            : step.state === "current"
              ? CircleIcon
              : CircleDashedIcon;
        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "relative flex items-start gap-2.5 px-4 py-4 md:px-5 border-[var(--line)]",
              i % 2 === 1 && "border-l",
              i >= 2 && "border-t md:border-t-0",
              i >= 1 && "md:border-l"
            )}
          >
            {step.state === "current" && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-4 right-4 md:left-5 md:right-5 h-[3px] bg-[var(--accent)]"
              />
            )}
            <Icon
              aria-hidden="true"
              weight={step.state === "done" ? "fill" : "bold"}
              className={cn(
                "size-[18px] shrink-0 mt-px",
                step.state === "done"
                  ? "text-[var(--ok)]"
                  : step.state === "current"
                    ? "text-[var(--accent-ink)]"
                    : "text-[var(--muted)]"
              )}
            />
            <div className="min-w-0">
              <div
                className={cn(
                  "text-[14px] font-[600] tracking-[-0.01em]",
                  step.state === "todo" && "text-[var(--ink-2)]"
                )}
              >
                {STEP_LABELS[step.key]}
              </div>
              <div className="mt-0.5 text-[13px] text-[var(--muted)]">
                {stepSub(step, progress, billing, depositPct)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
