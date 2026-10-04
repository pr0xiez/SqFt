"use client";

import { useState } from "react";
import type { MemberRow } from "@/components/settings/members/types";
import { Card } from "@/components/ui/Card";
import { BackLink, MetaSep, PageHeader } from "@/components/ui/PageHeader";
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
    <div className="max-w-[960px]">
      <PageHeader
        kicker={<BackLink href="/admin/orgs">Organizations</BackLink>}
        title={org.name}
        meta={
          <>
            <span>{org.slug}</span>
            <MetaSep />
            <span>{org.subscriptionStatus}</span>
            <MetaSep />
            <span>since {new Date(org.createdAt).toLocaleDateString()}</span>
          </>
        }
      />

      <Card
        flush
        title="Members"
        action={
          <span className="text-[13px] text-[var(--muted)]">
            <span className="type-figure text-[var(--ink-2)]">
              {active.length}
            </span>{" "}
            active
          </span>
        }
        className="mb-4 overflow-hidden"
      >
        {active.map((row) => (
          <AdminMemberRow
            key={row.id}
            orgId={org.id}
            row={row}
            onUpdated={upsert}
          />
        ))}
      </Card>

      <AddAdminUserForm orgId={org.id} onCreated={upsert} />

      {archived.length > 0 && (
        <Card
          flush
          title={`Archived (${archived.length})`}
          className="mt-8 overflow-hidden"
        >
          <div className="opacity-80">
            {archived.map((row) => (
              <AdminMemberRow
                key={row.id}
                orgId={org.id}
                row={row}
                onUpdated={upsert}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
