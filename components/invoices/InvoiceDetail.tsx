"use client";

import Link from "next/link";
import { useState } from "react";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import { VoidInvoiceDialog } from "@/components/invoices/VoidInvoiceDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useInvoice } from "@/lib/hooks/useInvoices";
import { invoiceOutstanding, paymentsPaidTotal } from "@/lib/invoices";
import { fmtDollar } from "@/lib/utils";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US") : "—";
}

const cardCls =
  "border border-[var(--line)] rounded-lg p-4 bg-[var(--paper)] mb-4";
const cardLabelCls =
  "text-[10px] font-[var(--font-mono)] uppercase tracking-[.07em] text-[var(--muted)] mb-2.5";

export function InvoiceDetail({
  invoiceId,
  estimateId,
}: {
  invoiceId: number;
  estimateId: number;
}) {
  const { data: inv, isLoading, error } = useInvoice(invoiceId);
  const { showToast } = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  if (isLoading) return <p className="p-8 text-[13px]">Loading…</p>;
  if (error || !inv)
    return (
      <p className="p-8 text-[13px] text-[var(--accent)]">
        {(error as Error)?.message ?? "Not found"}
      </p>
    );

  const paid = paymentsPaidTotal(inv.payments);
  const outstanding = invoiceOutstanding(inv);
  const lines = inv.snapshot?.lines ?? [];
  const isVoid = inv.status === "void";
  const isDraft = inv.status === "draft";
  const isPaid = inv.status === "paid";
  const canPay = !isDraft && !isVoid && !isPaid;

  async function copyLink() {
    if (!inv?.publicToken) return;
    const url = `${window.location.origin}/invoice-review/${inv.publicToken}`;
    await navigator.clipboard.writeText(url);
    showToast("Public link copied");
  }

  return (
    <main className="max-w-[820px] mx-auto p-8">
      <Link
        href={`/estimates/${estimateId}`}
        className="text-[12px] text-[var(--accent)]"
      >
        ← Estimate
      </Link>

      <div className="flex items-start gap-3 mt-2 mb-1">
        <h1 className="text-[24px] font-[700] tracking-[-0.02em]">
          Invoice #{inv.invoiceNumber}
        </h1>
        <span className="self-center text-[10px] uppercase tracking-[.05em] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-2)]">
          {inv.status}
        </span>
        <div className="ml-auto text-right">
          <div className="text-[24px] font-[700]">{fmtDollar(inv.amount)}</div>
          {inv.dueDate ? (
            <div className="text-[11px] text-[var(--accent)]">
              Due {fmtDate(inv.dueDate)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-[12px] text-[var(--muted)] mb-5">
        {inv.sentToEmail ? <>Sent to {inv.sentToEmail} · </> : null}
        {inv.publicToken ? (
          <button
            type="button"
            onClick={copyLink}
            className="text-[var(--accent)] underline"
          >
            copy public link
          </button>
        ) : null}
      </div>

      {!isVoid ? (
        <div className="flex gap-2 flex-wrap mb-6">
          {isDraft ? (
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => setSendOpen(true)}
            >
              Send
            </Button>
          ) : null}
          {canPay ? (
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => setPayOpen(true)}
            >
              Record payment
            </Button>
          ) : null}
          {!isDraft ? (
            <Button
              variant="default"
              size="sm"
              type="button"
              onClick={() => setSendOpen(true)}
            >
              Resend
            </Button>
          ) : null}
          {!isPaid ? (
            <Button
              variant="accent"
              size="sm"
              type="button"
              onClick={() => setVoidOpen(true)}
            >
              Void
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="text-[12px] text-[var(--muted)] mb-6">
          This invoice was voided on {fmtDate(inv.voidedAt)}.
        </div>
      )}

      <div className="flex gap-5 items-start flex-col md:flex-row">
        <div className="flex-[1.4] w-full">
          <div className={cardCls}>
            <div className={cardLabelCls}>Breakdown (from estimate)</div>
            {lines.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">
                Line breakdown is captured when the invoice is sent.
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {lines.map((l, i) => (
                    <tr
                      key={`${l.name}-${i}`}
                      className="border-b border-[var(--line)] last:border-b-0"
                    >
                      <td className="py-2">
                        <div className="font-[600]">{l.name}</div>
                        {l.description ? (
                          <div className="text-[11px] text-[var(--muted)]">
                            {l.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">{fmtDollar(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {paid > 0 ? (
              <>
                <div className="flex justify-between text-[13px] border-t border-[var(--line-2)] mt-2 pt-2">
                  <span>Invoice total</span>
                  <span>{fmtDollar(inv.amount)}</span>
                </div>
                <div className="flex justify-between text-[13px] pt-1">
                  <span>Paid to date</span>
                  <span>−{fmtDollar(paid)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between font-[700] text-[15px] border-t border-[var(--line-2)] mt-2 pt-2">
              <span>Balance due</span>
              <span>{fmtDollar(outstanding)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full">
          <div className={cardCls}>
            <div className={cardLabelCls}>Payments</div>
            <div className="flex justify-between text-[12px] rounded bg-[var(--surface-2)] px-2.5 py-2 mb-2.5">
              <span>Outstanding</span>
              <strong>{fmtDollar(outstanding)}</strong>
            </div>
            {inv.payments.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">
                No payments yet.
              </p>
            ) : (
              inv.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between text-[12.5px] py-1.5 border-b border-[var(--line)] last:border-b-0"
                >
                  <div>
                    {p.method === "stripe" &&
                    p.stripeNetAmount != null &&
                    p.stripeFeeAmount != null ? (
                      <>
                        <span>Paid {fmtDollar(p.amount)}</span>
                        <div className="text-[11px] text-[var(--muted)]">
                          Stripe fee {fmtDollar(p.stripeFeeAmount)} · You netted{" "}
                          {fmtDollar(p.stripeNetAmount)}
                        </div>
                      </>
                    ) : (
                      <>
                        {fmtDollar(p.amount)}
                        <div className="text-[11px] text-[var(--muted)]">
                          {p.method}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </div>
                      </>
                    )}
                  </div>
                  <div>{fmtDate(p.paidAt)}</div>
                </div>
              ))
            )}
          </div>

          <div className={cardCls}>
            <div className={cardLabelCls}>Activity</div>
            {inv.invoiceEvents.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">
                No activity yet.
              </p>
            ) : (
              <div className="border-l-2 border-[var(--line)] pl-3">
                {inv.invoiceEvents.map((e) => (
                  <div
                    key={e.id}
                    className="text-[11.5px] text-[var(--ink-2)] mb-2"
                  >
                    <span className="capitalize">
                      {e.type.replace(/_/g, " ")}
                    </span>
                    {e.actorName ? ` — ${e.actorName}` : ""} ·{" "}
                    {fmtDate(e.createdAt)}
                  </div>
                ))}
              </div>
            )}
          </div>
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
    </main>
  );
}
