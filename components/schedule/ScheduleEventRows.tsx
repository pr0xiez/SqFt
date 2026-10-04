import Link from "next/link";
import { CaretRightIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";

/** The fields a schedule row needs (CalEvent and the customer activity feed
 *  both carry them). */
export interface ScheduleRowEvent {
  id: number;
  type: string;
  title: string;
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  assignees: { id: string; name: string }[];
}

const TYPE_LABELS: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Event",
};

/** "Oct 12" from a `YYYY-MM-DD…` day, read at local noon so it can't slip. */
export function fmtDay(day: string): string {
  return new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "Mon" from a `YYYY-MM-DD…` day. */
export function fmtWeekday(day: string): string {
  return new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
  });
}

/**
 * Schedule slots as rows inside a flush card: day, title + type, time and
 * crew. Each row opens that week on the Schedule Manager.
 */
export function ScheduleEventRows({ events }: { events: ScheduleRowEvent[] }) {
  return (
    <ul>
      {events.map((ev) => {
        const day = ev.date.slice(0, 10);
        const crew = ev.assignees.map((a) => a.name).join(", ");
        const multiDay = ev.endDate && ev.endDate.slice(0, 10) !== day;
        return (
          <li key={ev.id} className="border-t border-[var(--line)]">
            <Link
              href={`/schedule?date=${day}`}
              className="group flex items-center gap-4 px-5 md:px-6 py-3 min-h-[56px] no-underline transition-colors hover:bg-[var(--hover)]"
            >
              <span className="w-14 shrink-0 text-center whitespace-nowrap">
                <span className="block text-[12px] text-[var(--muted)]">
                  {fmtWeekday(day)}
                </span>
                <span className="block type-figure text-[14px] font-[600]">
                  {fmtDay(day)}
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-[14.5px] font-[600] tracking-[-0.01em]">
                    {ev.title}
                  </span>
                  <Tag>{TYPE_LABELS[ev.type] ?? "Event"}</Tag>
                </span>
                <span className="block mt-0.5 text-[13px] text-[var(--muted)] truncate">
                  <span className="type-figure">
                    {ev.startTime}-{ev.endTime}
                  </span>
                  {multiDay && ev.endDate
                    ? `, through ${fmtDay(ev.endDate)}`
                    : ""}
                  {crew ? `, ${crew}` : ", no crew assigned"}
                </span>
              </span>
              <CaretRightIcon
                aria-hidden="true"
                className="size-[14px] shrink-0 text-[var(--muted)] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
