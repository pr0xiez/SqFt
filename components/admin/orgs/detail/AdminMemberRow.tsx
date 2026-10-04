"use client";

import { useState } from "react";
import type {
  MemberRole,
  MemberRow as Row,
} from "@/components/settings/members/types";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { useUpdateAdminOrgMember } from "@/lib/hooks/useAdminOrgMembers";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function AdminMemberRow({
  orgId,
  row,
  onUpdated,
}: {
  orgId: string;
  row: Row;
  onUpdated: (next: Row) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateAdminOrgMember(orgId);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_140px_auto] items-center gap-x-4 gap-y-2.5 px-5 md:px-6 py-3.5 border-t border-[var(--line)]">
      <div className="flex items-center gap-3 min-w-0">
        <CrewAvatar name={row.name || row.email} />
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
                patch({ userId: row.id, title: next || null });
              }
            }}
            className="-mx-1.5 mt-0.5 w-[calc(100%+12px)] text-[13px] text-[var(--muted)] placeholder:text-[var(--muted)] bg-transparent border border-transparent hover:border-[var(--line)] focus:border-[var(--field-border)] focus:text-[var(--ink)] rounded-[var(--r-in)] px-1.5 py-0.5"
            aria-label={`Title for ${row.name}`}
          />
        </div>
      </div>
      <div className="text-[13.5px] text-[var(--muted)] truncate">
        {row.email}
      </div>
      <div>
        <select
          value={row.role}
          onChange={(e) =>
            patch({ userId: row.id, role: e.target.value as MemberRole })
          }
          disabled={row.archived || mutation.isPending}
          className="field min-h-[34px] h-[34px] px-2.5 disabled:opacity-60"
          aria-label={`Role for ${row.name}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {error && <div className="field-error">{error}</div>}
      </div>
      <div className="md:text-right">
        <Button
          type="button"
          size="sm"
          variant={row.archived ? "default" : "ghost"}
          className={
            row.archived
              ? undefined
              : "hover:text-[var(--accent-ink)] hover:bg-[var(--accent-wash)]"
          }
          onClick={() => patch({ userId: row.id, archived: !row.archived })}
          disabled={mutation.isPending}
        >
          {row.archived ? "Restore" : "Archive"}
        </Button>
      </div>
    </div>
  );
}
