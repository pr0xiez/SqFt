"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CaretRightIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SiteMeasureEstimateSummary } from "@/lib/hooks/useSiteMeasures";

interface Props {
  estimates: SiteMeasureEstimateSummary[];
}

export function SiteMeasureEstimatesCard({ estimates }: Props) {
  return (
    <Card
      flush
      className="mb-4"
      title={
        <>
          Estimates for this site measure{" "}
          <span className="type-figure text-[15px] text-[var(--muted)]">
            ({estimates.length})
          </span>
        </>
      }
    >
      {estimates.length === 0 ? (
        <p className="px-5 md:px-6 pb-5 text-[14px] text-[var(--muted)]">
          No estimates yet. Create one to start pricing.
        </p>
      ) : (
        <ul>
          {estimates.map((q) => (
            <li key={q.id} className="border-t border-[var(--line)]">
              <Link
                href={`/estimates/${q.id}`}
                className="group flex items-center gap-3 sm:gap-4 px-5 md:px-6 min-h-[48px] py-2.5 no-underline transition-colors duration-150 hover:bg-[var(--hover)]"
              >
                <span className="type-figure text-[14px] font-[600] w-16 shrink-0">
                  #{q.estimateNumber}
                </span>
                <span className="text-[14px] text-[var(--muted)] flex-1 min-w-0">
                  <span className="type-figure">{q._count.lineItems}</span> line
                  item
                  {q._count.lineItems === 1 ? "" : "s"}
                </span>
                <StatusBadge status={q.status} />
                <span className="inline-flex items-center gap-1 text-[13.5px] font-[500] text-[var(--muted)] group-hover:text-[var(--ink)]">
                  <span className="hidden sm:inline">Open</span>
                  <CaretRightIcon
                    aria-hidden="true"
                    className="size-[14px] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
