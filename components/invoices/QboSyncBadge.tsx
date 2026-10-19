"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowsClockwiseIcon,
  ProhibitIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { keys } from "@/lib/hooks/queryKeys";
import type { InvoiceDetail } from "@/lib/hooks/useInvoices";
import { useQboSyncNow } from "@/lib/hooks/useQbo";

/** Poll fast while a just-queued sync settles, then back off, then stop:
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
      qc.invalidateQueries({ queryKey: keys.invoices.detail(invoiceId) });
      timer = setTimeout(
        tick,
        elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS
      );
    };
    timer = setTimeout(tick, POLL_FAST_MS);
    return () => clearTimeout(timer);
  }, [pending, qc, invoiceId]);

  if (!qboSync) return null;

  const inlineAction =
    "underline underline-offset-2 font-[600] hover:no-underline disabled:opacity-50";

  if (qboSync.state === "synced") {
    return (
      <Tag
        tone={qboSync.lastError ? "pending" : "ok"}
        title={qboSync.lastError ?? "This invoice is synced to QuickBooks"}
      >
        {qboSync.lastError
          ? "QuickBooks · synced with warning"
          : "QuickBooks ✓"}
      </Tag>
    );
  }

  if (qboSync.state === "void_synced") {
    return (
      <Tag icon={ProhibitIcon} title="This invoice is voided in QuickBooks">
        QuickBooks · voided
      </Tag>
    );
  }

  if (qboSync.state === "pending") {
    return (
      <Tag icon={ArrowsClockwiseIcon} title="Waiting to sync to QuickBooks">
        QuickBooks · syncing…
      </Tag>
    );
  }

  if (qboSync.state === "auth_required") {
    return (
      <Tag
        tone="bad"
        icon={WarningCircleIcon}
        title="The QuickBooks connection needs to be reauthorized. This sync is held until then"
      >
        QuickBooks · reconnect
        <Link href="/settings/integrations" className={`ml-1 ${inlineAction}`}>
          Open settings
        </Link>
      </Tag>
    );
  }

  return (
    <Tag
      tone="bad"
      icon={WarningCircleIcon}
      title={qboSync.lastError ?? "QuickBooks sync failed"}
    >
      QuickBooks · failed
      <button
        type="button"
        className={`ml-1 ${inlineAction}`}
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
    </Tag>
  );
}
