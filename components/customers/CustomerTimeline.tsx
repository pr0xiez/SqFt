"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingLine } from "@/components/ui/EmptyState";
import {
  CalendarCheckIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  EyeIcon,
  FileTextIcon,
  type Icon,
  PaperPlaneTiltIcon,
  ProhibitIcon,
  ReceiptIcon,
  RulerIcon,
  UserPlusIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type {
  TimelineEntry,
  TimelineKind,
  TimelineTone,
} from "@/lib/customers/activity";
import { fmtDollar } from "@/lib/utils";

const KIND_ICONS: Record<TimelineKind, Icon> = {
  customer: UserPlusIcon,
  siteMeasure: RulerIcon,
  drafted: FileTextIcon,
  sent: PaperPlaneTiltIcon,
  viewed: EyeIcon,
  approved: CheckCircleIcon,
  declined: XCircleIcon,
  closed: ProhibitIcon,
  invoice: ReceiptIcon,
  voided: ProhibitIcon,
  paymentFailed: WarningCircleIcon,
  payment: CurrencyDollarIcon,
  event: CalendarCheckIcon,
};

const TONE_TEXT: Record<TimelineTone, string> = {
  default: "text-[var(--muted)]",
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--accent-ink)]",
};

/** How many entries show before "Show all". */
const COLLAPSED = 8;

function fmtWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "-";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Everything that has happened with the customer, newest first: intake, site
 * measures, estimate and invoice milestones, payments and past visits. Each
 * entry links to the record it's about.
 */
export function CustomerTimeline({
  entries,
  loading,
}: {
  entries: TimelineEntry[] | undefined;
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const all = entries ?? [];
  const shown = showAll ? all : all.slice(0, COLLAPSED);

  return (
    <Card flush title="Activity" className="overflow-hidden">
      {loading && !entries ? (
        <div className="px-5 md:px-6 pb-5">
          <LoadingLine />
        </div>
      ) : (
        <>
          <ol>
            {shown.map((e) => {
              const KindIcon = KIND_ICONS[e.kind];
              const body = (
                <>
                  <span
                    className={cn(
                      "mt-px size-7 shrink-0 rounded-[var(--r)] bg-[var(--surface-2)] flex items-center justify-center",
                      TONE_TEXT[e.tone]
                    )}
                  >
                    <KindIcon aria-hidden="true" className="size-[15px]" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-[560] text-[var(--ink)] tracking-[-0.005em]">
                      {e.title}
                    </span>
                    {e.detail ? (
                      <span className="block mt-0.5 text-[13px] text-[var(--muted)] break-words">
                        {e.detail}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    {e.amount != null ? (
                      <span className="block type-figure text-[13.5px] font-[600] text-[var(--ink)]">
                        {fmtDollar(e.amount)}
                      </span>
                    ) : null}
                    <span className="block text-[12.5px] text-[var(--muted)]">
                      {fmtWhen(e.at)}
                    </span>
                  </span>
                </>
              );
              const rowClass =
                "flex items-start gap-3 px-5 md:px-6 py-3 no-underline";
              return (
                <li key={e.id} className="border-t border-[var(--line)]">
                  {e.href ? (
                    <Link
                      href={e.href}
                      className={cn(
                        rowClass,
                        "transition-colors hover:bg-[var(--hover)]"
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
          {all.length > COLLAPSED ? (
            <div className="border-t border-[var(--line)] px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show less" : `Show all ${all.length}`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
