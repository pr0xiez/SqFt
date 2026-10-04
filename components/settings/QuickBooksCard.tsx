"use client";

import { Button } from "@/components/ui/Button";
import { WarningCircleIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
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
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <h2 className="type-heading">QuickBooks Online</h2>
            {connection === null ? (
              <Tag>Not connected</Tag>
            ) : needsReauth ? (
              <Tag tone="bad">Needs reconnect</Tag>
            ) : (
              <Tag tone="ok">Connected</Tag>
            )}
          </div>
          {connection === null ? (
            <p className="text-[14px] text-[var(--muted)] max-w-[60ch]">
              Push customers, sent invoices, and payments into your QuickBooks
              company. Included, no extra fee. SqFt stays the source of truth;
              changes in QuickBooks never change SqFt records. Linked customers
              receive updates when you save them here.
            </p>
          ) : (
            <p className="text-[14px] text-[var(--muted)]">
              Connected to{" "}
              <strong className="font-[600] text-[var(--ink)]">
                {connection.companyName ?? "your company"}
              </strong>
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
            variant="danger"
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
          className="mt-5 flex gap-3 rounded-[var(--r)] bg-[var(--accent-wash)] px-4 py-3.5"
          role="alert"
        >
          <WarningCircleIcon
            aria-hidden="true"
            className="size-[18px] shrink-0 mt-px text-[var(--accent-ink)]"
          />
          <div className="min-w-0">
            <p className="text-[14px] font-[600] text-[var(--ink)]">
              QuickBooks needs to be reconnected
            </p>
            <p className="mt-1 mb-3 text-[13.5px] text-[var(--ink-2)]">
              The authorization expired or was revoked. Pending syncs are held
              (nothing is lost) and resume as soon as you reconnect.
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
        </div>
      ) : null}

      {connection === null ? (
        <Button
          variant="primary"
          type="button"
          className="mt-5"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
        >
          {connect.isPending ? "Redirecting…" : "Connect to QuickBooks"}
        </Button>
      ) : null}

      {connection !== null && health !== null ? (
        <dl className="mt-5 pt-5 border-t border-[var(--line)] grid grid-cols-3 gap-4 max-w-[420px]">
          <div>
            <dt className="type-label">Synced</dt>
            <dd className="type-stat mt-1.5 text-[22px]">{health.done}</dd>
          </div>
          <div>
            <dt className="type-label">Pending</dt>
            <dd className="type-stat mt-1.5 text-[22px]">
              {health.pending + health.pausedAuth}
            </dd>
          </div>
          <div>
            <dt className="type-label">Failed</dt>
            <dd
              className={cn(
                "type-stat mt-1.5 text-[22px]",
                health.failed > 0 && "text-[var(--accent-ink)]"
              )}
            >
              {health.failed}
            </dd>
          </div>
        </dl>
      ) : null}

      {connection !== null ? (
        <p className="mt-5 text-[13px] text-[var(--muted)]">
          Stripe payments post gross: record Stripe's processing fee in
          QuickBooks from your Stripe statement.
        </p>
      ) : null}
    </section>
  );
}
