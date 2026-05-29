import { redirect } from "next/navigation";
import { WorkspaceSettingsView } from "@/components/settings/workspace/WorkspaceSettingsView";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Workspace · Settings · SqFt" };

export default async function WorkspaceSettingsPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.orgId },
    select: {
      id: true,
      name: true,
      licenseNumber: true,
      timezone: true,
      locale: true,
      brandColor: true,
      tagline: true,
      showLicenseOnEstimates: true,
      defaultDepositPct: true,
      defaultValidityDays: true,
      defaultUnitLabel: true,
      defaultTerms: true,
    },
  });

  return <WorkspaceSettingsView initial={org} />;
}
