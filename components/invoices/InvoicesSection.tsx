"use client";

import { useQuery } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import { fmtDollar } from "@/lib/utils";

interface InvoiceRow {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  memo: string | null;
  dueDate: string | null;
  payments: Array<{ amount: number }>;
}

async function fetchInvoices(estimateId: number): Promise<InvoiceRow[]> {
  const res = await fetch(`/api/estimates/${estimateId}/invoices`);
  if (!res.ok) {
    const e = await readApiError(res, "Failed to load invoices");
    throw new Error(e.message);
  }
  return res.json();
}

function paidTotal(row: InvoiceRow): number {
  return row.payments.reduce((s, p) => s + p.amount, 0);
}

export function InvoicesSection({ estimateId }: { estimateId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", estimateId],
    queryFn: () => fetchInvoices(estimateId),
  });

  return (
    <section className="mt-8 border-t border-[var(--line)] pt-6">
      <h2 className="text-[16px] font-[700] mb-3">Invoices</h2>
      {isLoading ? (
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-[var(--accent)]">
          {(error as Error).message}
        </p>
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)]">No invoices yet.</p>
      ) : null}
      {data && data.length > 0 ? (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--muted)] text-[11px] uppercase">
              <th className="py-1">#</th>
              <th className="py-1">Memo</th>
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Amount</th>
              <th className="py-1 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-2">{row.invoiceNumber}</td>
                <td className="py-2">{row.memo ?? "—"}</td>
                <td className="py-2">{row.status}</td>
                <td className="py-2 text-right">{fmtDollar(row.amount)}</td>
                <td className="py-2 text-right">{fmtDollar(paidTotal(row))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
