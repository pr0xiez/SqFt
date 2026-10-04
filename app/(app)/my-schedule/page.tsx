import { MyScheduleView } from "@/components/schedule/MyScheduleView";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "My Schedule" };

export default async function MySchedulePage() {
  const session = await requireSession();
  return <MyScheduleView currentUserId={session.user.id} />;
}
