"use client";

import { useListAdminOrgs } from "@/lib/hooks/useAdminOrgs";
import { CreateOrgForm } from "./CreateOrgForm";
import { OrgsTable } from "./OrgsTable";
import type { AdminOrgRow } from "./types";

export function AdminOrgsView({ initial }: { initial: AdminOrgRow[] }) {
  const query = useListAdminOrgs(initial);
  const rows = query.data ?? initial;

  return (
    <div className="max-w-[960px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Organizations
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Every tenant on the platform. Create manual orgs for pilots and demos.
      </p>

      <div className="mb-6">
        <OrgsTable rows={rows} />
      </div>

      <CreateOrgForm
        onCreated={() => {
          // Hook invalidates the query; the table refreshes automatically.
        }}
      />
    </div>
  );
}
