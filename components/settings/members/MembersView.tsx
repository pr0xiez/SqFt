"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_SHELL,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { AddMemberForm } from "./AddMemberForm";
import { MEMBER_GRID, MemberRow } from "./MemberRow";
import type { MemberRow as Row } from "./types";

function MemberTableHead() {
  return (
    <div className={cn(TABLE_HEAD, MEMBER_GRID)}>
      <div className={TABLE_HEAD_CELL}>Member</div>
      <div className={TABLE_HEAD_CELL}>Email</div>
      <div className={TABLE_HEAD_CELL}>Role</div>
      <div className={TABLE_HEAD_CELL}>
        <span className="sr-only">Actions</span>
      </div>
    </div>
  );
}

export function MembersView({
  initial,
  currentUserId,
}: {
  initial: Row[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);

  function upsert(next: Row) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === next.id);
      if (idx === -1) return [...prev, next];
      const out = prev.slice();
      out[idx] = next;
      return out;
    });
  }

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  return (
    <div className="max-w-[960px]">
      <PageHeader
        title="Members"
        meta="Who can see and do what. Anyone here can be assigned to jobs."
      />

      <div className={cn(TABLE_SHELL, "mb-4")}>
        <MemberTableHead />
        {active.map((row) => (
          <MemberRow
            key={row.id}
            row={row}
            isSelf={row.id === currentUserId}
            onUpdated={upsert}
          />
        ))}
      </div>

      <AddMemberForm onCreated={upsert} />

      {archived.length > 0 && (
        <div className="mt-10">
          <h2 className="type-heading mb-3">
            Archived{" "}
            <span className="type-figure text-[15px] text-[var(--muted)]">
              ({archived.length})
            </span>
          </h2>
          <div className={TABLE_SHELL}>
            {archived.map((row) => (
              <MemberRow
                key={row.id}
                row={row}
                isSelf={row.id === currentUserId}
                onUpdated={upsert}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
