"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { Button } from "@/components/ui/Button";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { computeEstimateBilling, paymentsPaidTotal } from "@/lib/invoices";
import { fmtDollar } from "@/lib/utils";

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)]">
        {label}
      </div>
      <div className="text-[16px] font-[700]">{value}</div>
    </div>
  );
}

export function InvoicesSection({
  estimateId,
  estimateTotal,
  defaultDepositPct,
}: {
  estimateId: number;
  estimateTotal: number;
  defaultDepositPct: number;
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

  return (
    <section className="mt-8 border-t border-[var(--line)] pt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-[700]">Invoices</h2>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={billing.unbilled <= 0}
        >
          + Create invoice
        </Button>
      </div>

      <div className="flex gap-6 mb-4 rounded-md bg-[var(--surface-2)] px-4 py-3">
        <SummaryCell label="Invoiced" value={fmtDollar(billing.invoiced)} />
        <SummaryCell label="Unbilled" value={fmtDollar(billing.unbilled)} />
        <SummaryCell
          label="Outstanding"
          value={fmtDollar(billing.outstanding)}
        />
      </div>

      {isLoading ? (
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-[var(--accent)]">
          {(error as Error).message}
        </p>
      ) : null}
      {!isLoading && invoices.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)]">No invoices yet.</p>
      ) : null}

      {invoices.length > 0 ? (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--muted)] text-[11px] uppercase">
              <th className="py-1">#</th>
              <th className="py-1">Memo</th>
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Amount</th>
              <th className="py-1 text-right">Paid</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-2">{row.invoiceNumber}</td>
                <td className="py-2">{row.memo ?? "—"}</td>
                <td className="py-2">{row.status}</td>
                <td className="py-2 text-right">{fmtDollar(row.amount)}</td>
                <td className="py-2 text-right">
                  {fmtDollar(paymentsPaidTotal(row.payments))}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={`/invoices/${row.id}`}
                    className="text-[var(--accent)] underline"
                  >
                    open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <CreateInvoiceDialog
        estimateId={estimateId}
        unbilled={billing.unbilled}
        defaultDepositPct={defaultDepositPct}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </section>
  );
}
