import { redirect } from "next/navigation";
import { LineItemTemplatesView } from "@/components/settings/LineItemTemplatesView";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Line item templates · Settings · SqFt" };

export default async function LineItemTemplatesPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return <LineItemTemplatesView />;
}
