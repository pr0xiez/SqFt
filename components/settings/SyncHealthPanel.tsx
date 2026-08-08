"use client";

import Link from "next/link";
import type { QboStatus } from "@/lib/hooks/useQbo";

const KIND_LABELS: Record<string, string> = {
  sync_customer: "Customer",
  sync_invoice: "Invoice",
  sync_payment: "Payment",
  void_invoice: "Invoice void",
};

/** Failed-sync list under the QuickBooks card. Every row carries the
 *  human-readable lastError so a support conversation starts with the cause
 *  attached instead of "it silently didn't sync". */
export function SyncHealthPanel({ status }: { status: QboStatus }) {
  const errors = status.health?.recentErrors ?? [];
  if (status.connection === null || errors.length === 0) return null;

  return (
    <div className="mt-4 border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] px-5 py-4">
      <p className="text-[13px] font-[600] mb-2">Sync issues</p>
      <ul className="divide-y divide-[var(--line)]">
        {errors.map((e) => (
          <li key={e.id} className="py-2 text-[12px]">
            <span className="font-[600]">
              {KIND_LABELS[e.kind] ?? e.kind} #{e.entityId}
            </span>
            <span className="text-[var(--muted)]">
              {" — "}
              {e.lastError ?? "Unknown error"}
            </span>
            {e.invoiceId !== null ? (
              // Covers payment tasks too: the invoice-page Retry re-queues
              // the invoice AND all of its payments.
              <span className="text-[var(--muted)]">
                {" · retry from the "}
                <Link
                  className="text-[var(--accent)] underline"
                  href={`/invoices/${e.invoiceId}`}
                >
                  invoice page
                </Link>
              </span>
            ) : e.kind === "sync_customer" ? (
              <span className="text-[var(--muted)]">
                {" · saving the "}
                <Link
                  className="text-[var(--accent)] underline"
                  href={`/customers/${e.entityId}`}
                >
                  customer
                </Link>
                {" re-queues the sync"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
