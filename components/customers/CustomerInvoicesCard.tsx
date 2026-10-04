"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LoadingLine } from "@/components/ui/EmptyState";
import { CaretRightIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ActivityInvoice } from "@/lib/customers/activity";
import {
  invoiceOutstanding,
  isInvoiceOverdue,
  OVERBILL_EPSILON,
} from "@/lib/invoices";
import { fmtDollar, formatShortDate } from "@/lib/utils";

/** Every invoice across the customer's estimates, newest first. */
export function CustomerInvoicesCard({
  invoices,
  loading,
}: {
  invoices: ActivityInvoice[] | undefined;
  loading: boolean;
}) {
  return (
    <Card flush title="Invoices" className="overflow-hidden">
      {loading && !invoices ? (
        <div className="px-5 md:px-6 pb-5">
          <LoadingLine />
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <p className="px-5 md:px-6 pb-5 text-[14px] text-[var(--muted)]">
          No invoices yet. Bill from an approved estimate.
        </p>
      ) : (
        <ul>
          {invoices.map((inv) => {
            const overdue = isInvoiceOverdue(inv);
            const balance = invoiceOutstanding(inv);
            const owing =
              inv.status !== "void" &&
              inv.status !== "draft" &&
              balance > OVERBILL_EPSILON;
            return (
              <li key={inv.id} className="border-t border-[var(--line)]">
                <Link
                  href={`/invoices/${inv.id}`}
                  className="group flex items-center gap-3 px-5 md:px-6 py-3 min-h-[56px] no-underline transition-colors hover:bg-[var(--hover)]"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-[600] tracking-[-0.01em]">
                      Invoice{" "}
                      <span className="type-figure">#{inv.invoiceNumber}</span>
                    </span>
                    <span className="block mt-0.5 text-[13px] text-[var(--muted)] truncate">
                      Estimate{" "}
                      <span className="type-figure">#{inv.estimateNumber}</span>
                      {inv.dueDate
                        ? `, due ${formatShortDate(inv.dueDate)}`
                        : ""}
                    </span>
                  </span>
                  <StatusBadge status={overdue ? "overdue" : inv.status} />
                  <span className="w-[104px] shrink-0 text-right">
                    <span className="block type-figure text-[14px] font-[600]">
                      {fmtDollar(inv.amount)}
                    </span>
                    {owing ? (
                      <span className="block type-figure text-[12.5px] text-[var(--muted)]">
                        {fmtDollar(balance)} due
                      </span>
                    ) : null}
                  </span>
                  <CaretRightIcon
                    aria-hidden="true"
                    className="hidden sm:block size-[14px] shrink-0 text-[var(--muted)] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
