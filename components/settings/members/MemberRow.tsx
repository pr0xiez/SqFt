"use client";

import { useState } from "react";
import { useUpdateMember } from "@/lib/hooks/useMembers";
import type { MemberRole, MemberRow as Row } from "./types";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

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
    <div className="grid grid-cols-[1fr_1.5fr_140px_90px] items-center gap-3 px-4 py-3 border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[11px] font-[var(--font-mono)] font-[600] text-[var(--ink)]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-[500] truncate">{row.name}</div>
          <input
            defaultValue={row.title ?? ""}
            placeholder="Add title"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== (row.title ?? "")) {
                patch({ id: row.id, title: next || null });
              }
            }}
            className="mt-0.5 w-full text-[12px] text-[var(--muted)] bg-transparent border border-transparent hover:border-[var(--line)] focus:border-[var(--line)] rounded-[3px] px-1 py-0.5"
            aria-label={`Title for ${row.name}`}
          />
        </div>
      </div>
      <div className="text-[12px] text-[var(--muted)] truncate">
        {row.email}
      </div>
      <div>
        <select
          value={row.role}
          onChange={(e) =>
            patch({ id: row.id, role: e.target.value as MemberRole })
          }
          disabled={isSelf || row.archived || mutation.isPending}
          className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] px-2 py-1.5 rounded-[5px] disabled:opacity-60"
          aria-label={`Role for ${row.name}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {error && (
          <div className="text-[11px] text-[var(--accent)] mt-1">{error}</div>
        )}
      </div>
      <div className="text-right">
        {!isSelf && (
          <button
            type="button"
            onClick={() => patch({ id: row.id, archived: !row.archived })}
            disabled={mutation.isPending}
            className="text-[11px] font-[var(--font-mono)] uppercase tracking-[.04em] px-2 py-1 border border-[var(--line)] rounded-[5px] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {row.archived ? "Restore" : "Archive"}
          </button>
        )}
      </div>
    </div>
  );
}
