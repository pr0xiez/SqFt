"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import type { InvoiceDetail } from "@/lib/hooks/useInvoices";
import { useQboSyncNow } from "@/lib/hooks/useQbo";

/**
 * Per-invoice QBO sync status. Renders nothing when `qboSync` is null (org
 * not connected, or nothing has been enqueued for this invoice yet). Failed
 * state surfaces the task's lastError and a Retry that re-queues the
 * invoice + its payments.
 */
export function QboSyncBadge({
  invoiceId,
  qboSync,
}: {
  invoiceId: number;
  qboSync: InvoiceDetail["qboSync"];
}) {
  const { showToast } = useToast();
  const syncNow = useQboSyncNow(invoiceId);
  const qc = useQueryClient();

  // A pending badge is a live state — poll until it resolves so the user
  // (and the E2E specs) see it flip to synced/failed without a reload.
  const pending = qboSync?.state === "pending";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["invoices", invoiceId] });
    }, 2500);
    return () => clearInterval(timer);
  }, [pending, qc, invoiceId]);

  if (!qboSync) return null;

  const base =
    "self-center inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.05em] px-2 py-0.5 rounded-full";

  if (qboSync.state === "synced") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--sage)]`}
        title="This invoice is synced to QuickBooks"
      >
        QuickBooks ✓
      </span>
    );
  }

  if (qboSync.state === "pending") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--muted)]`}
        title="Waiting to sync to QuickBooks"
      >
        QuickBooks · syncing…
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-[var(--surface-2)] text-[var(--accent)]`}
      title={qboSync.lastError ?? "QuickBooks sync failed"}
    >
      QuickBooks · failed
      <button
        type="button"
        className="underline normal-case tracking-normal"
        disabled={syncNow.isPending}
        onClick={() =>
          syncNow.mutate(undefined, {
            onSuccess: () => showToast("QuickBooks sync queued"),
            onError: (err) => showToast(err.message),
          })
        }
      >
        {syncNow.isPending ? "Retrying…" : "Retry"}
      </button>
    </span>
  );
}
