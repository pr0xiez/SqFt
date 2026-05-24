import { CrewRosterView } from "@/components/crew/CrewRosterView";
import { hasMinRole } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Crew · SqFt" };

export default async function CrewPage() {
  const session = await requireSession();
  const canEdit = hasMinRole(session.user.role, "lead");
  return <CrewRosterView canEdit={canEdit} />;
}
