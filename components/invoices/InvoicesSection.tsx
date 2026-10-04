"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingLine } from "@/components/ui/EmptyState";
import { ArrowRightIcon, PlusIcon } from "@/components/ui/icons";
import { Stat } from "@/components/ui/Stat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TapeMeter } from "@/components/ui/TapeMeter";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { computeEstimateBilling, paymentsPaidTotal } from "@/lib/invoices";
import { fmtDollar } from "@/lib/utils";

const TH = "py-2.5 px-3 text-[13px] font-[500] text-[var(--muted)]";
const TD = "py-3 px-3 align-middle";

export function InvoicesSection({
  estimateId,
  estimateTotal,
  defaultDepositPct,
  className = "mt-8",
}: {
  estimateId: number;
  estimateTotal: number;
  /** The estimate's own deposit share, seeding the dialog's % option. */
  defaultDepositPct: number;
  className?: string;
}) {
  const { data, isLoading, error } = useInvoices(estimateId);
  const [createOpen, setCreateOpen] = useState(false);

  const invoices = data ?? [];
  const billing = computeEstimateBilling(
    estimateTotal,
    invoices.map((i) => ({
      amount: i.amount,
      status: i.status,
      paidAmount: paymentsPaidTotal(i.payments),
    }))
  );
  const invoicedShare =
    estimateTotal > 0 ? billing.invoiced / estimateTotal : 0;

  return (
    <Card
      title="Invoices"
      className={className}
      action={
        <Button
          variant="default"
          size="sm"
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={billing.unbilled <= 0}
        >
          <PlusIcon aria-hidden="true" />
          Create invoice
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-x-4 gap-y-4">
        <Stat label="Invoiced" size="sm" value={fmtDollar(billing.invoiced)} />
        <Stat label="Unbilled" size="sm" value={fmtDollar(billing.unbilled)} />
        <Stat
          label="Outstanding"
          size="sm"
          value={fmtDollar(billing.outstanding)}
        />
      </div>
      <TapeMeter
        value={invoicedShare}
        size="sm"
        label="Invoiced share of the estimate total"
        className="mt-5 mb-5"
      />

      {isLoading ? <LoadingLine /> : null}
      {error ? (
        <p className="text-[14px] text-[var(--accent-ink)]">
          {(error as Error).message}
        </p>
      ) : null}
      {!isLoading && invoices.length === 0 ? (
        <p className="border-t border-[var(--line)] pt-4 text-[14px] text-[var(--muted)]">
          No invoices yet.
        </p>
      ) : null}

      {invoices.length > 0 ? (
        <div className="-mx-5 md:-mx-6 -mb-5 md:-mb-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px] border-collapse">
            <thead>
              <tr className="text-left border-t border-b border-[var(--line)]">
                <th className={`${TH} pl-5 md:pl-6`}>#</th>
                <th className={TH}>Memo</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-right`}>Paid</th>
                <th className={`${TH} pr-5 md:pr-6`}>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)] transition-colors"
                >
                  <td className={`${TD} pl-5 md:pl-6 type-figure font-[600]`}>
                    {row.invoiceNumber}
                  </td>
                  <td className={`${TD} text-[var(--ink-2)]`}>
                    {row.memo ?? "-"}
                  </td>
                  <td className={TD}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={`${TD} text-right type-figure`}>
                    {fmtDollar(row.amount)}
                  </td>
                  <td className={`${TD} text-right type-figure`}>
                    {fmtDollar(paymentsPaidTotal(row.payments))}
                  </td>
                  <td className={`${TD} pr-5 md:pr-6 text-right`}>
                    <Link
                      href={`/invoices/${row.id}`}
                      className="group inline-flex items-center gap-1 min-h-[36px] text-[14px] font-[560] text-[var(--ink)] no-underline hover:text-[var(--accent-ink)]"
                    >
                      Open
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-[14px] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5"
                      />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <CreateInvoiceDialog
        estimateId={estimateId}
        unbilled={billing.unbilled}
        defaultDepositPct={defaultDepositPct}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </Card>
  );
}
