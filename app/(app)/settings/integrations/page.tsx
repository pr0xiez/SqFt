import { redirect } from "next/navigation";
import { IntegrationsView } from "@/components/settings/IntegrationsView";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Integrations" };

export default async function IntegrationsSettingsPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  return <IntegrationsView />;
}
