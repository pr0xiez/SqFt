import { redirect } from "next/navigation";
import { MembersView } from "@/components/settings/members/MembersView";
import type { MemberRow } from "@/components/settings/members/types";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Members · Settings · SqFt" };

export default async function MembersPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  const users = await prisma.user.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const initial: MemberRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as MemberRow["role"],
    createdAt: u.createdAt.toISOString(),
  }));

  return <MembersView initial={initial} currentUserId={session.user.id} />;
}
