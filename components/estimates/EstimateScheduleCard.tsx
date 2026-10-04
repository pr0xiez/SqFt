import { ScheduleEventRows } from "@/components/schedule/ScheduleEventRows";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CalendarPlusIcon } from "@/components/ui/icons";
import type { CalEvent } from "@/lib/hooks/useEvents";

/**
 * The estimate's slots on the schedule (the install job and any visits),
 * each linking to its week on the Schedule Manager.
 */
export function EstimateScheduleCard({
  events,
  onSchedule,
  className,
}: {
  /** The estimate's events, soonest first. */
  events: CalEvent[];
  onSchedule: () => void;
  className?: string;
}) {
  const hasJob = events.some((e) => e.type === "job");
  return (
    <Card
      flush
      title="Schedule"
      className={className}
      action={
        <Button size="sm" type="button" onClick={onSchedule}>
          <CalendarPlusIcon aria-hidden="true" />
          {hasJob ? "Add visit" : "Schedule job"}
        </Button>
      }
    >
      {events.length === 0 ? (
        <p className="px-5 md:px-6 pb-5 text-[14px] text-[var(--muted)]">
          No job on the schedule yet.
        </p>
      ) : (
        <ScheduleEventRows events={events} />
      )}
    </Card>
  );
}
