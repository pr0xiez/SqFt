import { redirect } from "next/navigation";
import { PaymentsSettingsView } from "@/components/settings/PaymentsSettingsView";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Payments settings" };

export default async function PaymentsSettingsPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  return <PaymentsSettingsView />;
}
