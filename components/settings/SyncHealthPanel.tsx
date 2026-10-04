"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { WarningCircleIcon } from "@/components/ui/icons";
import type { QboStatus } from "@/lib/hooks/useQbo";

const KIND_LABELS: Record<string, string> = {
  sync_customer: "Customer",
  sync_invoice: "Invoice",
  sync_payment: "Payment",
  void_invoice: "Invoice void",
};

const LINK =
  "font-[560] text-[var(--accent-ink)] underline underline-offset-2 hover:text-[var(--ink)]";

/** Failed-sync list under the QuickBooks card. Every row carries the
 *  human-readable lastError so a support conversation starts with the cause
 *  attached instead of "it silently didn't sync". */
export function SyncHealthPanel({ status }: { status: QboStatus }) {
  const errors = status.health?.recentErrors ?? [];
  if (status.connection === null || errors.length === 0) return null;

  return (
    <Card title="Sync issues" flush>
      <ul className="border-t border-[var(--line)] divide-y divide-[var(--line)]">
        {errors.map((e) => (
          <li key={e.id} className="flex gap-3 px-5 md:px-6 py-3.5">
            <WarningCircleIcon
              aria-hidden="true"
              className="size-[17px] shrink-0 mt-0.5 text-[var(--accent-ink)]"
            />
            <div className="min-w-0">
              <span className="text-[14px] font-[600]">
                {KIND_LABELS[e.kind] ?? e.kind} #{e.entityId}
              </span>
              <p className="mt-0.5 text-[13.5px] text-[var(--ink-2)] break-words">
                {e.lastError ?? "Unknown error"}
              </p>
              {e.status === "done" ? (
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  Sync completed; review this note in QuickBooks.
                </p>
              ) : e.invoiceId !== null ? (
                // Covers payment tasks too: the invoice-page Retry re-queues
                // the invoice AND all of its payments.
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  Retry from the{" "}
                  <Link className={LINK} href={`/invoices/${e.invoiceId}`}>
                    invoice page
                  </Link>
                  .
                </p>
              ) : e.kind === "sync_customer" ? (
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  Saving the{" "}
                  <Link className={LINK} href={`/customers/${e.entityId}`}>
                    customer
                  </Link>{" "}
                  re-queues the sync.
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
