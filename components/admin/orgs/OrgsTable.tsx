"use client";

import type { AdminOrgRow, SubscriptionStatus } from "./types";

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  manual: "bg-[var(--surface-2)] text-[var(--muted)]",
  trialing: "bg-[#fff4d6] text-[#8a6a00]",
  active: "bg-[#dff6e3] text-[#15703a]",
  past_due: "bg-[#fde0e0] text-[#a02020]",
  unpaid: "bg-[#fde0e0] text-[#a02020]",
  canceled: "bg-[var(--surface-2)] text-[var(--muted)] line-through",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OrgsTable({ rows }: { rows: AdminOrgRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-6 text-center text-[13px] text-[var(--muted)]">
        No organizations yet.
      </div>
    );
  }
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] overflow-hidden">
      <div className="grid grid-cols-[1.5fr_120px_160px_140px_80px] gap-3 px-4 py-2 text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] border-b border-[var(--line)]">
        <div>Org</div>
        <div>Status</div>
        <div>Renews / Trial ends</div>
        <div>Created</div>
        <div className="text-right">Users</div>
      </div>
      {rows.map((row) => {
        const renewal = row.currentPeriodEndsAt ?? row.trialEndsAt;
        return (
          <div
            key={row.id}
            className="grid grid-cols-[1.5fr_120px_160px_140px_80px] gap-3 px-4 py-3 text-[13px] items-center border-b border-[var(--line)] last:border-b-0"
          >
            <div>
              <div className="font-[500]">{row.name}</div>
              <div className="text-[11px] text-[var(--muted)] font-[var(--font-mono)]">
                {row.slug}
              </div>
            </div>
            <div>
              <span
                className={`inline-block text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase px-2 py-[2px] rounded-[4px] ${STATUS_STYLES[row.subscriptionStatus]}`}
              >
                {row.subscriptionStatus}
              </span>
            </div>
            <div className="text-[var(--muted)]">{formatDate(renewal)}</div>
            <div className="text-[var(--muted)]">
              {formatDate(row.createdAt)}
            </div>
            <div className="text-right font-[var(--font-mono)]">
              {row.userCount}
            </div>
          </div>
        );
      })}
    </div>
  );
}
