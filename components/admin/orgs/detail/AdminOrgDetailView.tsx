"use client";

import Link from "next/link";
import { useState } from "react";
import type { MemberRow } from "@/components/settings/members/types";
import { AddAdminUserForm } from "./AddAdminUserForm";
import { AdminMemberRow } from "./AdminMemberRow";

export type AdminOrgSummary = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  createdAt: string;
};

export function AdminOrgDetailView({
  org,
  initialMembers,
}: {
  org: AdminOrgSummary;
  initialMembers: MemberRow[];
}) {
  const [rows, setRows] = useState<MemberRow[]>(initialMembers);

  function upsert(next: MemberRow) {
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
      <Link
        href="/admin/orgs"
        className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase text-[var(--muted)] hover:text-[var(--ink)]"
      >
        ← Organizations
      </Link>
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mt-2 mb-1">
        {org.name}
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        {org.slug} · {org.subscriptionStatus} · since{" "}
        {new Date(org.createdAt).toLocaleDateString()}
      </p>

      <h2 className="text-[12px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-2">
        Members
      </h2>
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] mb-4">
        {active.map((row) => (
          <AdminMemberRow
            key={row.id}
            orgId={org.id}
            row={row}
            onUpdated={upsert}
          />
        ))}
      </div>

      <AddAdminUserForm orgId={org.id} onCreated={upsert} />

      {archived.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[12px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-2">
            Archived ({archived.length})
          </h2>
          <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] opacity-80">
            {archived.map((row) => (
              <AdminMemberRow
                key={row.id}
                orgId={org.id}
                row={row}
                onUpdated={upsert}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
