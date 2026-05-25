"use client";

import { useRouter } from "next/navigation";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

const tagLabels: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Other",
};

function dotColor(ev: CalEvent): string {
  if (ev.type === "job") return "var(--accent)";
  if (ev.type === "visit") return "var(--gold)";
  return "var(--muted)";
}

function isPast(ev: CalEvent): boolean {
  const now = new Date();
  const [h, m] = ev.endTime.split(":").map(Number);
  const end = new Date();
  end.setHours(h, m, 0, 0);
  return end < now;
}

interface Props {
  events: CalEvent[];
}

export function ScheduleCard({ events }: Props) {
  const router = useRouter();
  const today = todayStr();
  const todayEvents = events
    .filter((e) => e.date.slice(0, 10) === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <header className="flex items-baseline justify-between mb-[18px] pb-[14px] border-b border-[var(--line)]">
        <div className="text-[14px] font-[600] tracking-[-0.01em] flex items-center gap-2.5">
          Today&apos;s Schedule
          <span className="font-[var(--font-mono)] text-[10px] px-[7px] py-[2px] border border-[var(--line)] rounded-[10px] text-[var(--muted)] font-[500]">
            {todayEvents.length} event{todayEvents.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/schedule")}
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-0 cursor-pointer hover:text-[var(--ink)] tracking-[.02em]"
        >
          Full calendar →
        </button>
      </header>

      <div className="relative pl-16">
        <div
          className="absolute top-2 bottom-2 w-px bg-[var(--line)]"
          style={{ left: "50px" }}
        />

        {todayEvents.length === 0 ? (
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-2">
            No events scheduled today.
          </p>
        ) : (
          todayEvents.map((ev, idx) => {
            const completed = isPast(ev);
            const isLast = idx === todayEvents.length - 1;
            const address = ev.customer?.address?.split(",")[0];

            return (
              <div
                key={ev.id}
                className={`relative flex gap-3.5 py-3.5 cursor-pointer transition-[padding] duration-150 hover:pl-1.5 ${
                  isLast ? "" : "border-b border-dashed border-[var(--line)]"
                }`}
              >
                <span
                  className="absolute font-[var(--font-mono)] text-[11px] text-[var(--muted)] text-right pt-0.5"
                  style={{ left: "-64px", width: "46px" }}
                >
                  {ev.startTime}
                </span>

                <span
                  className="absolute w-2.5 h-2.5 rounded-full z-10 mt-[18px]"
                  style={{
                    left: "-18px",
                    background: completed ? "var(--sage)" : "var(--surface)",
                    border: `2px solid ${completed ? "var(--sage)" : dotColor(ev)}`,
                  }}
                />

                <div className="flex-1 min-w-0">
                  <div
                    className="text-[14px] font-[600] tracking-[-0.01em] mb-1"
                    style={{
                      color: completed ? "var(--muted)" : undefined,
                      textDecoration: completed ? "line-through" : undefined,
                      textDecorationColor: completed
                        ? "var(--line-2)"
                        : undefined,
                    }}
                  >
                    {ev.title}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] flex items-center gap-2.5 flex-wrap">
                    <span className="text-[9px] px-[7px] py-[2px] border border-[var(--line)] rounded-[10px] uppercase tracking-[.06em]">
                      {tagLabels[ev.type] ?? ev.type}
                    </span>

                    {ev.crewMembers.length > 0 && (
                      <span className="flex items-center ml-2">
                        {ev.crewMembers.slice(0, 3).map((m) => (
                          <span key={m.id} className="-ml-[5px] first:ml-0">
                            <CrewAvatar name={m.name} size="sm" />
                          </span>
                        ))}
                      </span>
                    )}

                    {address && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[var(--line-2)]" />
                        <span>{address}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}
