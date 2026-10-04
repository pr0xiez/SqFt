import { redirect } from "next/navigation";
import { WorkspaceSettingsView } from "@/components/settings/workspace/WorkspaceSettingsView";
import { getOrgSettingsOrThrow } from "@/lib/repositories/organizationRepo";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  const org = await getOrgSettingsOrThrow(session.user.orgId);

  return <WorkspaceSettingsView initial={org} />;
}
