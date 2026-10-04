"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { useListAdminOrgs } from "@/lib/hooks/useAdminOrgs";
import { CreateOrgForm } from "./CreateOrgForm";
import { OrgsTable } from "./OrgsTable";
import type { AdminOrgRow } from "./types";

export function AdminOrgsView({ initial }: { initial: AdminOrgRow[] }) {
  const query = useListAdminOrgs(initial);
  const rows = query.data ?? initial;

  return (
    <div className="max-w-[1040px]">
      <PageHeader
        title="Organizations"
        meta="Every tenant on the platform. Create manual orgs for pilots and demos."
      />

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
