"use client";

import { useState } from "react";
import { AddMemberForm } from "./AddMemberForm";
import { MemberRow } from "./MemberRow";
import type { MemberRow as Row } from "./types";

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
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Members
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Who can see and do what. Anyone here can be assigned to jobs.
      </p>

      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] mb-4">
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
        <div className="mt-8">
          <h2 className="text-[12px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-2">
            Archived ({archived.length})
          </h2>
          <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] opacity-80">
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
