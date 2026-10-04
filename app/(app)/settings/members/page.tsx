import { redirect } from "next/navigation";
import { MembersView } from "@/components/settings/members/MembersView";
import type { MemberRow } from "@/components/settings/members/types";
import { listUsers } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  const users = await listUsers(session.user.orgId, { includeArchived: true });

  const initial: MemberRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as MemberRow["role"],
    title: u.title,
    archived: u.archived,
    createdAt: u.createdAt.toISOString(),
  }));

  return <MembersView initial={initial} currentUserId={session.user.id} />;
}
