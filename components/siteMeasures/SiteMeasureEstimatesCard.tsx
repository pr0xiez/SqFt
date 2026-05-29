"use client";

import Link from "next/link";
import type { SiteMeasureEstimateSummary } from "@/lib/hooks/useSiteMeasures";

interface Props {
  estimates: SiteMeasureEstimateSummary[];
}

export function SiteMeasureEstimatesCard({ estimates }: Props) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 mb-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Estimates for this siteMeasure ({estimates.length})
        </h2>
      </header>

      {estimates.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-6 text-center">
          No estimates yet — create one to start pricing.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {estimates.map((q) => (
            <li key={q.id}>
              <Link
                href={`/estimates/${q.id}`}
                className="flex items-center gap-4 py-3 hover:bg-[var(--surface-2)] -mx-3 px-3 rounded"
              >
                <span className="font-[var(--font-mono)] text-[12px] font-semibold w-16">
                  #{q.estimateNumber}
                </span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] flex-1">
                  {q._count.lineItems} line item
                  {q._count.lineItems === 1 ? "" : "s"}
                </span>
                <span
                  className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${statusClass(q.status)}`}
                >
                  {q.status}
                </span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "sent":
      return "text-[var(--gold)] border-[var(--gold)]";
    case "approved":
      return "text-[var(--sage)] border-[var(--sage)]";
    case "declined":
      return "text-[var(--accent)] border-[var(--accent)]";
    default:
      return "text-[var(--muted)] border-[var(--line)]";
  }
}
