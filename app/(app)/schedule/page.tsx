import { redirect } from "next/navigation";
import { ScheduleView } from "@/components/schedule/CalendarGrid";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Schedule Manager" };

export default async function SchedulePage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return <ScheduleView canEdit />;
}
