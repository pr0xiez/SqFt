"use client";

import { useState } from "react";
import { QboSyncBadge } from "@/components/invoices/QboSyncBadge";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import { VoidInvoiceDialog } from "@/components/invoices/VoidInvoiceDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState, LoadingLine } from "@/components/ui/EmptyState";
import {
  ArrowCounterClockwiseIcon,
  CurrencyDollarIcon,
  LinkSimpleIcon,
  PaperPlaneTiltIcon,
  ProhibitIcon,
} from "@/components/ui/icons";
import { BackLink, MetaSep, PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TapeMeter } from "@/components/ui/TapeMeter";
import { useToast } from "@/components/ui/Toast";
import {
  type InvoiceDetail as Invoice,
  useInvoice,
  useInvoicePublicToken,
} from "@/lib/hooks/useInvoices";
import {
  invoiceOutstanding,
  isInvoiceOverdue,
  paymentsPaidTotal,
} from "@/lib/invoices";
import { fmtDollar } from "@/lib/utils";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US") : "-";
}

type Payment = Invoice["payments"][number];

function PaymentRow({ p }: { p: Payment }) {
  const isStripeNet =
    p.method === "stripe" &&
    p.stripeNetAmount != null &&
    p.stripeFeeAmount != null;
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-[var(--line)] last:border-b-0">
      <div className="min-w-0">
        {isStripeNet ? (
          <>
            <div className="text-[14px]">
              Paid{" "}
              <span className="type-figure font-[600]">
                {fmtDollar(p.amount)}
              </span>
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--muted)]">
              Stripe fee{" "}
              <span className="type-figure">
                {fmtDollar(p.stripeFeeAmount ?? 0)}
              </span>{" "}
              · You netted{" "}
              <span className="type-figure">
                {fmtDollar(p.stripeNetAmount ?? 0)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="type-figure text-[14px] font-[600]">
              {fmtDollar(p.amount)}
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--muted)]">
              <span className="capitalize">{p.method}</span>
              {p.reference ? ` · ${p.reference}` : ""}
            </div>
          </>
        )}
      </div>
      <div className="shrink-0 text-[13px] text-[var(--muted)]">
        {fmtDate(p.paidAt)}
      </div>
    </div>
  );
}

export function InvoiceDetail({
  invoiceId,
  estimateId,
}: {
  invoiceId: number;
  estimateId: number;
}) {
  const { data: inv, isLoading, error } = useInvoice(invoiceId);
  const { showToast } = useToast();
  const publicToken = useInvoicePublicToken(invoiceId);
  const [sendOpen, setSendOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  if (isLoading) return <LoadingLine />;
  if (error || !inv)
    return <ErrorState message={(error as Error)?.message ?? "Not found"} />;

  const paid = paymentsPaidTotal(inv.payments);
  const outstanding = invoiceOutstanding(inv);
  const lines = inv.snapshot?.lines ?? [];
  const isVoid = inv.status === "void";
  const isDraft = inv.status === "draft";
  const isPaid = inv.status === "paid";
  const canPay = !isDraft && !isVoid && !isPaid;
  const overdue = isInvoiceOverdue(inv);
  const paidShare = inv.amount > 0 ? paid / inv.amount : 0;

  async function copyLink() {
    try {
      const { publicToken: token } = await publicToken.mutateAsync();
      const url = `${window.location.origin}/invoice-review/${token}`;
      await navigator.clipboard.writeText(url);
      showToast("Public link copied");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to copy link");
    }
  }

  return (
    <div className="max-w-[1040px]">
      <PageHeader
        kicker={<BackLink href={`/estimates/${estimateId}`}>Estimate</BackLink>}
        title={`Invoice #${inv.invoiceNumber}`}
        meta={
          <>
            <StatusBadge status={overdue ? "overdue" : inv.status} />
            <QboSyncBadge invoiceId={inv.id} qboSync={inv.qboSync} />
            {inv.sentToEmail ? (
              <>
                <MetaSep />
                <span className="min-w-0 break-all">
                  Sent to {inv.sentToEmail}
                </span>
              </>
            ) : null}
            {inv.hasPublicToken ? (
              <>
                <MetaSep />
                <button
                  type="button"
                  onClick={copyLink}
                  disabled={publicToken.isPending}
                  className="inline-flex items-center gap-1.5 min-h-[36px] text-[var(--ink)] font-[500] underline underline-offset-[3px] decoration-[var(--line-2)] hover:decoration-[var(--ink)] disabled:opacity-50"
                >
                  <LinkSimpleIcon aria-hidden="true" className="size-[15px]" />
                  copy public link
                </button>
              </>
            ) : null}
          </>
        }
        actions={
          isVoid ? null : (
            <>
              {isDraft ? (
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => setSendOpen(true)}
                >
                  <PaperPlaneTiltIcon aria-hidden="true" />
                  Send
                </Button>
              ) : null}
              {canPay ? (
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => setPayOpen(true)}
                >
                  <CurrencyDollarIcon aria-hidden="true" />
                  Record payment
                </Button>
              ) : null}
              {!isDraft ? (
                <Button
                  variant="default"
                  type="button"
                  onClick={() => setSendOpen(true)}
                >
                  <ArrowCounterClockwiseIcon aria-hidden="true" />
                  Resend
                </Button>
              ) : null}
              {!isPaid ? (
                <Button
                  variant="danger"
                  type="button"
                  onClick={() => setVoidOpen(true)}
                >
                  <ProhibitIcon aria-hidden="true" />
                  Void
                </Button>
              ) : null}
            </>
          )
        }
      />

      {isVoid ? (
        <p className="-mt-2 mb-6 text-[14px] text-[var(--muted)]">
          This invoice was voided on {fmtDate(inv.voidedAt)}.
        </p>
      ) : null}

      <section className="card p-5 md:p-6 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
          <Stat label="Amount" value={fmtDollar(inv.amount)} />
          <Stat label="Paid" value={fmtDollar(paid)} />
          <Stat label="Outstanding" value={fmtDollar(outstanding)} />
          <Stat
            label="Due"
            value={fmtDate(inv.dueDate)}
            size="sm"
            valueClassName="mt-2.5"
            sub={
              overdue ? (
                <span className="font-[560] text-[var(--accent-ink)]">
                  Overdue
                </span>
              ) : undefined
            }
          />
        </div>
        {!isVoid ? (
          <TapeMeter
            value={paidShare}
            size="sm"
            label="Paid share of the invoice amount"
            className="mt-6"
          />
        ) : null}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-start">
        <Card title="Breakdown (from estimate)">
          {lines.length === 0 ? (
            <p className="text-[14px] text-[var(--muted)]">
              Line breakdown is captured when the invoice is sent.
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <tbody>
                {lines.map((l, i) => (
                  <tr
                    key={`${l.name}-${i}`}
                    className="border-b border-[var(--line)] last:border-b-0 align-top"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="font-[600]">{l.name}</div>
                      {l.description ? (
                        <div className="mt-0.5 text-[13px] text-[var(--muted)]">
                          {l.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-right type-figure whitespace-nowrap">
                      {fmtDollar(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {paid > 0 ? (
            <>
              <div className="flex justify-between gap-3 text-[14px] border-t border-[var(--line-2)] mt-2 pt-2.5">
                <span className="text-[var(--ink-2)]">Invoice total</span>
                <span className="type-figure">{fmtDollar(inv.amount)}</span>
              </div>
              <div className="flex justify-between gap-3 text-[14px] pt-1.5">
                <span className="text-[var(--ink-2)]">Paid to date</span>
                <span className="type-figure">−{fmtDollar(paid)}</span>
              </div>
            </>
          ) : null}
          <div className="flex items-baseline justify-between gap-3 border-t border-[var(--line-2)] mt-2.5 pt-3">
            <span className="text-[15px] font-[650]">Balance due</span>
            <span className="type-stat text-[22px]">
              {fmtDollar(outstanding)}
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Payments">
            {inv.payments.length === 0 ? (
              <p className="text-[14px] text-[var(--muted)]">
                No payments yet.
              </p>
            ) : (
              <div className="-my-3">
                {inv.payments.map((p) => (
                  <PaymentRow key={p.id} p={p} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Activity">
            {inv.invoiceEvents.length === 0 ? (
              <p className="text-[14px] text-[var(--muted)]">
                No activity yet.
              </p>
            ) : (
              <ol className="border-l border-[var(--line-2)] pl-4 flex flex-col gap-3">
                {inv.invoiceEvents.map((e) => (
                  <li key={e.id} className="text-[14px] leading-snug">
                    <span className="capitalize font-[560] text-[var(--ink)]">
                      {e.type.replace(/_/g, " ")}
                    </span>
                    {e.actorName ? (
                      <span className="text-[var(--ink-2)]">
                        , {e.actorName}
                      </span>
                    ) : null}
                    <div className="mt-0.5 text-[13px] text-[var(--muted)]">
                      {fmtDate(e.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <SendInvoiceDialog
        invoiceId={inv.id}
        estimateId={estimateId}
        invoiceNumber={inv.invoiceNumber}
        customerEmail={inv.sentToEmail ?? inv.customerEmail}
        alreadySent={!isDraft}
        open={sendOpen}
        onClose={() => setSendOpen(false)}
      />
      <RecordPaymentDialog
        invoiceId={inv.id}
        estimateId={estimateId}
        outstanding={outstanding}
        open={payOpen}
        onClose={() => setPayOpen(false)}
      />
      <VoidInvoiceDialog
        invoiceId={inv.id}
        estimateId={estimateId}
        invoiceNumber={inv.invoiceNumber}
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
      />
    </div>
  );
}
