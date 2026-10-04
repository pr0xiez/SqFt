"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { EstimateLockBanner } from "@/components/estimates/EstimateLockBanner";
import { EstimateScheduleCard } from "@/components/estimates/EstimateScheduleCard";
import { JobProgressStrip } from "@/components/estimates/JobProgressStrip";
import { LineItemSection } from "@/components/estimates/LineItemSection";
import { ReviseButton } from "@/components/estimates/ReviseButton";
import { SendEstimateDialog } from "@/components/estimates/SendEstimateDialog";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";
import type { EventFormDefaults } from "@/components/schedule/EventFormPanel";
import { ScheduleEventPanel } from "@/components/schedule/ScheduleEventPanel";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingLine } from "@/components/ui/EmptyState";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CalendarPlusIcon,
  PaperPlaneTiltIcon,
  ReceiptIcon,
} from "@/components/ui/icons";
import {
  Breadcrumbs,
  MetaSep,
  PageHeader,
  recordTrail,
} from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { isEstimateLocked } from "@/lib/estimateStatus";
import {
  computeJobProgress,
  type JobAction,
} from "@/lib/estimates/jobProgress";
import { computeEstimateView } from "@/lib/estimateView";
import { useEstimate, useUpdateEstimate } from "@/lib/hooks/useEstimates";
import { useEvents } from "@/lib/hooks/useEvents";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { useLineItemTemplates } from "@/lib/hooks/useLineItemTemplates";
import { computeEstimateBilling, paymentsPaidTotal } from "@/lib/invoices";
import { type RoomItem, todayStr } from "@/lib/utils";

interface Props {
  estimateId: number;
}

/** How the header's billing action opens the invoice dialog. */
type BillAction = "deposit" | "balance";

export function EstimateBuilderView({ estimateId }: Props) {
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const { data: templates = [] } = useLineItemTemplates();
  const { data: invoices } = useInvoices(estimateId);
  const { data: allEvents } = useEvents();
  const updateEstimate = useUpdateEstimate(estimateId);
  const { showToast } = useToast();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [billAction, setBillAction] = useState<BillAction | null>(null);
  const [scheduleDefaults, setScheduleDefaults] =
    useState<EventFormDefaults | null>(null);
  const [today] = useState(todayStr);

  const events = useMemo(
    () =>
      (allEvents ?? [])
        .filter((e) => e.estimateId === estimateId)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime)
        ),
    [allEvents, estimateId]
  );

  if (isLoading) {
    return <LoadingLine label="Loading estimate…" className="py-8" />;
  }

  if (!estimate) {
    return <ErrorState message="Estimate not found." className="px-0" />;
  }

  const locked = isEstimateLocked(estimate.status);
  const approved = estimate.status === "approved";

  const rooms = (estimate.siteMeasure.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );

  const estimateView = computeEstimateView({
    lineItems: estimate.lineItems ?? [],
    items: estimate.siteMeasure.items,
    markupPct: estimate.markupPct,
    depositPct: estimate.depositPct,
  });

  const billing = computeEstimateBilling(
    estimateView.total,
    (invoices ?? []).map((i) => ({
      amount: i.amount,
      status: i.status,
      paidAmount: paymentsPaidTotal(i.payments),
    }))
  );
  const progress = computeJobProgress({
    status: estimate.status,
    depositPct: estimate.depositPct,
    billing,
    jobEvents: events.filter((e) => e.type === "job"),
    today,
  });
  // An approved estimate's next step depends on its invoices and schedule;
  // hold the action until both have loaded rather than flash a wrong one.
  const progressReady =
    !approved || (invoices !== undefined && allEvents !== undefined);
  const next = progressReady ? progress.next : null;

  const customer = estimate.siteMeasure.location?.customer;
  const address = estimate.siteMeasure.location?.address;
  const hasRevisions =
    Boolean(estimate.revisedFrom) || (estimate.revisedBy?.length ?? 0) > 0;
  const scheduled = events.some((e) => e.type === "job");

  function openSchedule() {
    const hasJob = events.some((e) => e.type === "job");
    setScheduleDefaults({
      type: hasJob ? "visit" : "job",
      title: `${hasJob ? "Visit" : "Install"}: ${customer?.name ?? `Estimate #${estimate?.estimateNumber}`}`,
      customerId: customer?.id,
      estimateId,
      // An install is a working day; a visit keeps the form's one-hour slot.
      ...(hasJob ? {} : { startTime: "08:00", endTime: "17:00" }),
    });
  }

  const PRIMARY: Record<JobAction, ReactNode> = {
    send: (
      <Button variant="primary" onClick={() => setSendDialogOpen(true)}>
        <PaperPlaneTiltIcon aria-hidden="true" />
        Send to customer
      </Button>
    ),
    resend: (
      <Button variant="primary" onClick={() => setSendDialogOpen(true)}>
        <PaperPlaneTiltIcon aria-hidden="true" />
        Resend
      </Button>
    ),
    bill_deposit: (
      <Button variant="primary" onClick={() => setBillAction("deposit")}>
        <ReceiptIcon aria-hidden="true" />
        Bill deposit
      </Button>
    ),
    schedule_job: (
      <Button variant="primary" onClick={openSchedule}>
        <CalendarPlusIcon aria-hidden="true" />
        Schedule job
      </Button>
    ),
    bill_balance: (
      <Button variant="primary" onClick={() => setBillAction("balance")}>
        <ReceiptIcon aria-hidden="true" />
        Bill balance
      </Button>
    ),
    revise: <ReviseButton estimateId={estimate.id} variant="primary" />,
  };

  const operations = (
    <>
      <InvoicesSection
        estimateId={estimateId}
        estimateTotal={estimateView.total}
        defaultDepositPct={estimate.depositPct}
        className={approved ? "mb-6" : "mt-8"}
      />
      {(approved || events.length > 0) && (
        <EstimateScheduleCard
          events={events}
          onSchedule={openSchedule}
          className={approved ? "mb-8" : "mt-6"}
        />
      )}
    </>
  );

  return (
    <>
      <PageHeader
        kicker={
          <Breadcrumbs
            items={recordTrail({
              customer,
              siteMeasure: estimate.siteMeasure,
            })}
          />
        }
        title={`Estimate #${estimate.estimateNumber}`}
        meta={
          <>
            {/* Locked estimates carry their status in the lock banner. */}
            {!locked && <StatusBadge status={estimate.status} />}
            {customer && (
              <>
                {!locked && <MetaSep />}
                <Link
                  href={`/customers/${customer.id}`}
                  className="font-[560] text-[var(--ink-2)] no-underline hover:text-[var(--ink)] hover:underline underline-offset-[3px]"
                >
                  {customer.name}
                </Link>
              </>
            )}
            {customer && address && (
              <>
                <MetaSep />
                <span>{address}</span>
              </>
            )}
            {/* Revision chain links */}
            {hasRevisions && <MetaSep />}
            {estimate.revisedFrom && (
              <Link
                href={`/estimates/${estimate.revisedFrom.id}`}
                className="inline-flex items-center gap-1.5 font-[500] text-[var(--accent-ink)] hover:underline"
              >
                <ArrowCounterClockwiseIcon
                  aria-hidden="true"
                  className="size-[14px]"
                />
                Revision of E
                <span className="type-figure">
                  #{estimate.revisedFrom.estimateNumber}
                </span>
              </Link>
            )}
            {estimate.revisedBy?.map((rev) => (
              <Link
                key={rev.id}
                href={`/estimates/${rev.id}`}
                className="group inline-flex items-center gap-1.5 font-[500] text-[var(--accent-ink)] hover:underline"
              >
                Revised by E
                <span className="type-figure">#{rev.estimateNumber}</span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-[14px] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </>
        }
        actions={
          <>
            {approved && (
              <ReviseButton
                estimateId={estimate.id}
                variant={next ? "default" : "ink"}
              />
            )}
            {approved &&
              progressReady &&
              !scheduled &&
              next !== "schedule_job" && (
                <Button onClick={openSchedule}>
                  <CalendarPlusIcon aria-hidden="true" />
                  Schedule job
                </Button>
              )}
            {next ? PRIMARY[next] : null}
          </>
        }
      />

      {/* Lock banner: shown when the estimate is approved or declined */}
      {locked && (
        <EstimateLockBanner
          status={estimate.status as "approved" | "declined"}
          approvedAt={estimate.approvedAt ?? null}
          declinedAt={estimate.declinedAt ?? null}
          declineReason={estimate.declineReason ?? null}
          declineSource={estimate.estimateEvents?.[0]?.source ?? null}
          supersededByEstimateNumber={
            (
              estimate.estimateEvents?.[0]?.metadata as {
                supersededByEstimateNumber?: number;
              } | null
            )?.supersededByEstimateNumber ?? null
          }
        />
      )}

      {/* Once approved, the job's progress, billing and schedule lead the
          page; the (now read-only) line items follow. */}
      {approved && progressReady && (
        <JobProgressStrip
          progress={progress}
          billing={billing}
          depositPct={estimate.depositPct}
        />
      )}
      {approved && operations}

      {/* Line Items + inline totals/settings */}
      <LineItemSection
        lineItems={estimate.lineItems ?? []}
        rooms={rooms}
        markupPct={estimate.markupPct}
        depositPct={estimate.depositPct}
        readOnly={locked}
        templates={templates}
        onSave={async (patch) => {
          try {
            await updateEstimate.mutateAsync(patch);
            showToast("Saved");
          } catch {
            showToast("Save failed");
          }
        }}
      />

      {!approved && operations}

      <SendEstimateDialog
        estimateId={estimate.id}
        estimateNumber={estimate.estimateNumber}
        orgName={estimate.org?.name ?? ""}
        customerEmail={estimate.siteMeasure.location?.customer?.email ?? null}
        hasToken={estimate.hasApprovalToken}
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
      />

      <CreateInvoiceDialog
        estimateId={estimate.id}
        unbilled={billing.unbilled}
        defaultDepositPct={estimate.depositPct}
        initialMode={billAction === "deposit" ? "pct" : "remaining"}
        initialMemo={billAction === "deposit" ? "Deposit" : "Final balance"}
        open={billAction !== null}
        onClose={() => setBillAction(null)}
      />

      <ScheduleEventPanel
        open={scheduleDefaults !== null}
        onClose={() => setScheduleDefaults(null)}
        defaults={scheduleDefaults}
        customer={customer ? { id: customer.id, name: customer.name } : null}
        estimate={
          customer
            ? {
                id: estimate.id,
                estimateNumber: estimate.estimateNumber,
                customerId: customer.id,
              }
            : null
        }
      />
    </>
  );
}
