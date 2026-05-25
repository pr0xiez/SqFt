import { ScheduleView } from "@/components/schedule/CalendarGrid";
import { hasMinRole } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Schedule - SqFt" };

export default async function SchedulePage() {
  const session = await requireSession();
  const canEdit = hasMinRole(session.user.role, "lead");
  return <ScheduleView canEdit={canEdit} />;
}
