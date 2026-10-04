"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CELL } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { useUpdateMember } from "@/lib/hooks/useMembers";
import type { MemberRole, MemberRow as Row } from "./types";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

/** Column template shared by the members table header and its rows. */
export const MEMBER_GRID =
  "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_150px_112px]";

export function MemberRow({
  row,
  isSelf,
  onUpdated,
}: {
  row: Row;
  isSelf: boolean;
  onUpdated: (next: Row) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateMember();

  function patch(input: Parameters<typeof mutation.mutate>[0]) {
    setError(null);
    mutation.mutate(input, {
      onSuccess: (updated) => onUpdated(updated),
      onError: (err: unknown) => {
        const msg =
          typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to update member";
        setError(msg);
      },
    });
  }

  const initials =
    row.name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("") ||
    row.email[0]?.toUpperCase() ||
    "·";

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-y-2 py-3 border-b border-[var(--line)] last:border-b-0",
        MEMBER_GRID,
        row.archived && "text-[var(--ink-2)]"
      )}
    >
      <div
        className={cn(
          CELL,
          "col-span-2 md:col-span-1 flex items-center gap-3 min-w-0"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-8 shrink-0 rounded-full flex items-center justify-center text-[12px] font-[650] leading-none",
            row.archived
              ? "bg-[var(--surface-2)] text-[var(--muted)]"
              : "bg-[var(--ink)] text-[var(--bg)]"
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-[600] tracking-[-0.01em] truncate">
            {row.name}
          </div>
          <input
            defaultValue={row.title ?? ""}
            placeholder="Add title"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== (row.title ?? "")) {
                patch({ id: row.id, title: next || null });
              }
            }}
            className="-ml-1.5 mt-0.5 w-full max-w-[260px] h-7 px-1.5 text-[13px] text-[var(--muted)] placeholder:text-[var(--muted)] bg-transparent border border-transparent rounded-[var(--r-in)] hover:border-[var(--field-border)] focus:border-[var(--accent)] focus:text-[var(--ink)] focus:outline-none transition-colors"
            aria-label={`Title for ${row.name}`}
          />
        </div>
      </div>
      <div
        className={cn(
          CELL,
          "col-span-2 md:col-span-1 pl-[58px] md:pl-3.5 text-[13.5px] text-[var(--muted)] truncate"
        )}
      >
        {row.email}
      </div>
      <div className={cn(CELL, "pl-[58px] md:pl-3.5")}>
        <select
          value={row.role}
          onChange={(e) =>
            patch({ id: row.id, role: e.target.value as MemberRole })
          }
          disabled={isSelf || row.archived || mutation.isPending}
          className="field min-h-[34px] h-[34px] pl-2.5 text-[14px] max-w-[180px] md:max-w-none"
          aria-label={`Role for ${row.name}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {error && (
          <div className="field-error mt-1.5" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className={cn(CELL, "text-right")}>
        {!isSelf && (
          <Button
            type="button"
            size="sm"
            variant={row.archived ? "default" : "ghost"}
            className={
              row.archived
                ? undefined
                : "hover:text-[var(--accent-ink)] hover:bg-[var(--accent-wash)]"
            }
            onClick={() => patch({ id: row.id, archived: !row.archived })}
            disabled={mutation.isPending}
          >
            {row.archived ? "Restore" : "Archive"}
          </Button>
        )}
      </div>
    </div>
  );
}
