"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import type { InvoiceDetail } from "@/lib/hooks/useInvoices";
import { useQboSyncNow } from "@/lib/hooks/useQbo";

/** Poll fast while a just-queued sync settles, then back off, then stop —
 *  the cron sweeper owns anything that takes longer than this window. */
const POLL_FAST_MS = 2_500;
const POLL_SLOW_MS = 10_000;
const POLL_FAST_WINDOW_MS = 30_000;
const POLL_DEADLINE_MS = 3 * 60_000;

/**
 * Per-invoice QBO sync status. Renders nothing when `qboSync` is null (org
 * not connected, or nothing has been enqueued for this invoice yet). Failed
 * state surfaces the task's lastError and a Retry that re-queues the
 * invoice + its payments; auth_required points at Settings → Integrations
 * instead of pretending a dead connection is "syncing".
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

  // A pending badge is a live state — poll (bounded) until it resolves so
  // the user (and the E2E specs) see it flip without a reload.
  const pending = qboSync?.state === "pending";
  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > POLL_DEADLINE_MS) return;
      qc.invalidateQueries({ queryKey: ["invoices", invoiceId] });
      timer = setTimeout(
        tick,
        elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS
      );
    };
    timer = setTimeout(tick, POLL_FAST_MS);
    return () => clearTimeout(timer);
  }, [pending, qc, invoiceId]);

  if (!qboSync) return null;

  const base =
    "self-center inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.05em] px-2 py-0.5 rounded-full";

  if (qboSync.state === "synced") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--sage)]`}
        title={qboSync.lastError ?? "This invoice is synced to QuickBooks"}
      >
        {qboSync.lastError
          ? "QuickBooks · synced with warning"
          : "QuickBooks ✓"}
      </span>
    );
  }

  if (qboSync.state === "void_synced") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--muted)]`}
        title="This invoice is voided in QuickBooks"
      >
        QuickBooks · voided
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

  if (qboSync.state === "auth_required") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--accent)]`}
        title="The QuickBooks connection needs to be reauthorized — this sync is held until then"
      >
        QuickBooks · reconnect
        <Link
          href="/settings/integrations"
          className="underline normal-case tracking-normal"
        >
          Open settings
        </Link>
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
