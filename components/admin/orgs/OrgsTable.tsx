"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { BuildingsIcon } from "@/components/ui/icons";
import { type StatusTone, Tag } from "@/components/ui/StatusBadge";
import {
  CELL,
  CELL_FIGURE,
  CELL_META,
  CELL_PRIMARY,
  CELL_SUB,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_SHELL,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { AdminOrgRow, SubscriptionStatus } from "./types";

const STATUS_TONES: Record<SubscriptionStatus, StatusTone> = {
  manual: "neutral",
  trialing: "pending",
  active: "ok",
  past_due: "bad",
  unpaid: "bad",
  canceled: "neutral",
};

const GRID_COLS = "md:grid-cols-[minmax(0,1.5fr)_120px_160px_140px_80px]";

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OrgsTable({ rows }: { rows: AdminOrgRow[] }) {
  if (rows.length === 0) {
    return (
      <div className={TABLE_SHELL}>
        <EmptyState icon={BuildingsIcon} title="No organizations yet." />
      </div>
    );
  }
  return (
    <div className={TABLE_SHELL}>
      <div className={cn(TABLE_HEAD, GRID_COLS)}>
        <div className={TABLE_HEAD_CELL}>Org</div>
        <div className={TABLE_HEAD_CELL}>Status</div>
        <div className={TABLE_HEAD_CELL}>Renews / Trial ends</div>
        <div className={TABLE_HEAD_CELL}>Created</div>
        <div className={cn(TABLE_HEAD_CELL, "text-right")}>Users</div>
      </div>
      {rows.map((row) => {
        const renewal = row.currentPeriodEndsAt ?? row.trialEndsAt;
        const status = (
          <Tag
            tone={STATUS_TONES[row.subscriptionStatus]}
            className={
              row.subscriptionStatus === "canceled" ? "line-through" : undefined
            }
          >
            {row.subscriptionStatus}
          </Tag>
        );
        return (
          <div
            key={row.id}
            className={cn(
              "grid grid-cols-1 items-center border-b border-[var(--line)] last:border-b-0 transition-colors hover:bg-[var(--hover)]",
              GRID_COLS
            )}
          >
            <div className={cn(CELL, "py-3.5 min-w-0")}>
              <Link
                href={`/admin/orgs/${row.id}`}
                className={cn(
                  CELL_PRIMARY,
                  "text-[var(--ink)] underline-offset-2 hover:text-[var(--accent-ink)] hover:underline"
                )}
              >
                {row.name}
              </Link>
              <div className={CELL_SUB}>{row.slug}</div>
              {/* phones: the columns fold into one meta line */}
              <div className="md:hidden mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--muted)]">
                {status}
                <span>
                  <span className="type-figure text-[var(--ink-2)]">
                    {row.userCount}
                  </span>{" "}
                  users
                </span>
                <span>Created {formatDate(row.createdAt)}</span>
              </div>
            </div>
            <div className={cn(CELL, "py-3.5 hidden md:block")}>{status}</div>
            <div className={cn(CELL, CELL_META, "py-3.5 hidden md:block")}>
              {formatDate(renewal)}
            </div>
            <div className={cn(CELL, CELL_META, "py-3.5 hidden md:block")}>
              {formatDate(row.createdAt)}
            </div>
            <div className={cn(CELL, "py-3.5 hidden md:block text-right")}>
              <span className={cn(CELL_FIGURE, "font-[600]")}>
                {row.userCount}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
