"use client";

import {
  ScheduleEventRows,
  type ScheduleRowEvent,
} from "@/components/schedule/ScheduleEventRows";
import { Card } from "@/components/ui/Card";
import { LoadingLine } from "@/components/ui/EmptyState";

/** What's booked next with this customer: visits and install jobs. */
export function CustomerUpcomingCard({
  events,
  loading,
}: {
  events: ScheduleRowEvent[] | undefined;
  loading: boolean;
}) {
  return (
    <Card flush title="Upcoming" className="overflow-hidden">
      {loading && !events ? (
        <div className="px-5 md:px-6 pb-5">
          <LoadingLine />
        </div>
      ) : !events || events.length === 0 ? (
        <p className="px-5 md:px-6 pb-5 text-[14px] text-[var(--muted)]">
          Nothing on the schedule.
        </p>
      ) : (
        <ScheduleEventRows events={events} />
      )}
    </Card>
  );
}
