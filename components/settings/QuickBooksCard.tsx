"use client";

import { Button } from "@/components/ui/Button";
import type { QboStatus } from "@/lib/hooks/useQbo";
import { useQboConnect, useQboDisconnect } from "@/lib/hooks/useQbo";

/**
 * Connection card for Settings → Integrations. States:
 *   unconfigured (env absent)      → card hidden entirely
 *   no connection                  → Connect to QuickBooks
 *   connected + active             → company name, health counts, disconnect
 *   connected + disconnected      → reconnect banner
 */
export function QuickBooksCard({ status }: { status: QboStatus }) {
  const connect = useQboConnect();
  const disconnect = useQboDisconnect();

  if (!status.configured) return null;

  const { connection, health } = status;
  const needsReauth =
    connection !== null && connection.status === "disconnected";

  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-[600] mb-1">QuickBooks Online</p>
          {connection === null ? (
            <p className="text-[13px] text-[var(--muted)]">
              Push customers, sent invoices, and payments into your QuickBooks
              company — included, no extra fee. SqFt stays the source of truth;
              changes in QuickBooks never change SqFt records. Linked customers
              receive updates when you save them here.
            </p>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">
              Connected to{" "}
              <strong>{connection.companyName ?? "your company"}</strong>
              {connection.lastSyncedAt
                ? ` · last synced ${new Date(
                    connection.lastSyncedAt
                  ).toLocaleString("en-US")}`
                : null}
            </p>
          )}
        </div>
        {connection !== null && !needsReauth ? (
          <Button
            variant="default"
            size="sm"
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : null}
      </div>

      {needsReauth ? (
        <div
          className="mt-4 border border-[var(--accent)] rounded-[var(--r)] px-4 py-3"
          role="alert"
        >
          <p className="text-[13px] font-[600] mb-1">
            QuickBooks needs to be reconnected
          </p>
          <p className="text-[12px] text-[var(--muted)] mb-3">
            The authorization expired or was revoked. Pending syncs are held —
            nothing is lost — and resume as soon as you reconnect.
          </p>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
          >
            {connect.isPending ? "Redirecting…" : "Reconnect"}
          </Button>
        </div>
      ) : null}

      {connection === null ? (
        <button
          type="button"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
          className="mt-4 inline-flex items-center rounded-[0.375rem] bg-[#2ca01c] px-4 py-2 text-[13px] font-[600] text-white disabled:opacity-60"
        >
          {connect.isPending ? "Redirecting…" : "Connect to QuickBooks"}
        </button>
      ) : null}

      {connection !== null && health !== null ? (
        <dl className="mt-4 flex gap-6 text-[13px]">
          <div>
            <dt className="text-[11px] uppercase tracking-[.05em] text-[var(--muted)]">
              Synced
            </dt>
            <dd className="font-[600]">{health.done}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[.05em] text-[var(--muted)]">
              Pending
            </dt>
            <dd className="font-[600]">{health.pending + health.pausedAuth}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[.05em] text-[var(--muted)]">
              Failed
            </dt>
            <dd
              className={`font-[600] ${
                health.failed > 0 ? "text-[var(--accent)]" : ""
              }`}
            >
              {health.failed}
            </dd>
          </div>
        </dl>
      ) : null}

      {connection !== null ? (
        <p className="mt-4 text-[11px] text-[var(--muted)]">
          Stripe payments post gross — record Stripe's processing fee in
          QuickBooks from your Stripe statement.
        </p>
      ) : null}
    </div>
  );
}
