import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Dashboard — SqFt" };

export default async function DashboardPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return <DashboardView />;
}
