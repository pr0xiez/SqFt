"use client";

import Link from "next/link";
import type { EstimateQuoteSummary } from "@/lib/hooks/useEstimates";

interface Props {
  quotes: EstimateQuoteSummary[];
}

export function EstimateQuotesCard({ quotes }: Props) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 mb-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Quotes for this estimate ({quotes.length})
        </h2>
      </header>

      {quotes.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-6 text-center">
          No quotes yet — create one to start pricing.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link
                href={`/quotes/${q.id}`}
                className="flex items-center gap-4 py-3 hover:bg-[var(--surface-2)] -mx-3 px-3 rounded"
              >
                <span className="font-[var(--font-mono)] text-[12px] font-semibold w-16">
                  #{q.quoteNumber}
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
    case "accepted":
      return "text-[var(--sage)] border-[var(--sage)]";
    case "declined":
      return "text-[var(--accent)] border-[var(--accent)]";
    default:
      return "text-[var(--muted)] border-[var(--line)]";
  }
}
