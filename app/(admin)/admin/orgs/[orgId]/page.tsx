import { notFound } from "next/navigation";
import { AdminOrgDetailView } from "@/components/admin/orgs/detail/AdminOrgDetailView";
import type { MemberRow } from "@/components/settings/members/types";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { getOrgById, listUsers } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Organization" };

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await requireSession();
  if (!isSuperAdmin(session.user.email)) return null;

  const { orgId } = await params;
  const org = await getOrgById(orgId);
  if (!org) notFound();

  const users = await listUsers(orgId, { includeArchived: true });
  const initialMembers: MemberRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as MemberRow["role"],
    title: u.title,
    archived: u.archived,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <AdminOrgDetailView
      org={{
        id: org.id,
        name: org.name,
        slug: org.slug,
        subscriptionStatus: org.subscriptionStatus,
        createdAt: org.createdAt.toISOString(),
      }}
      initialMembers={initialMembers}
    />
  );
}
