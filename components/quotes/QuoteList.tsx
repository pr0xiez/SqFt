"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  filterQuotes,
  type QuoteStatusFilter,
} from "@/components/quotes/filterQuotes";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { fmtBig } from "@/lib/utils";

const STATUS_FILTERS: { value: QuoteStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

const STATUS_PILL_COLOR: Record<string, string> = {
  draft: "text-[var(--muted)]",
  sent: "text-[var(--gold)]",
  accepted: "text-[var(--sage)]",
  declined: "text-[var(--accent)]",
};

export function QuoteListView() {
  const router = useRouter();
  const { data: quotes = [], isLoading } = useQuotes();
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<QuoteStatusFilter>("all");

  const filtered = filterQuotes(quotes, query, status);
  const isNarrowed = filtered.length !== quotes.length;
  const trimmedQuery = query.trim();

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            SqFt · Pricing
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Quotes
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {quotes.length} quote{quotes.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search quote #, customer, estimate…"
        />
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={cn(
              "font-[var(--font-mono)] text-[11px] px-3 py-1.5 border rounded-[6px] cursor-pointer transition-colors duration-150",
              status === value
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
            )}
          >
            {label}
          </button>
        ))}
        {isNarrowed && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] ml-auto">
            {filtered.length} shown
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row (desktop only) */}
        <div className="hidden md:grid grid-cols-[80px_1fr_120px_120px_110px_110px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          {["#", "Customer", "Estimate", "Total", "Status", "Date"].map((h) => (
            <div
              key={h}
              className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
            >
              {h}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No quotes yet.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {trimmedQuery.length > 0
              ? `No quotes match "${trimmedQuery}".`
              : "No quotes match."}
          </div>
        ) : (
          filtered.map((q) => {
            const customer = q.estimate.customer;
            const estimateLabel = `#${q.estimate.estimateNumber ?? q.estimate.id}`;
            const totalLabel = q.total === null ? "—" : `$${fmtBig(q.total)}`;
            const pillColor =
              STATUS_PILL_COLOR[q.status] ?? "text-[var(--muted)]";

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => router.push(`/quotes/${q.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_120px_120px_110px_110px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
              >
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span className="font-[var(--font-mono)] text-[13px] font-[600]">
                    #{q.quoteNumber}
                  </span>
                </div>
                <div className="px-3.5 py-3.5">
                  <div className="text-[14px] font-[600] tracking-[-0.01em]">
                    {customer?.name ?? "—"}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap md:hidden">
                    #{q.quoteNumber} · {totalLabel} ·{" "}
                    <span className={pillColor}>{q.status}</span>
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap hidden md:block">
                    {customer?.address ?? ""}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <div className="font-[var(--font-mono)] text-[13px]">
                    {estimateLabel}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <div className="text-[13px] font-[600]">{totalLabel}</div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span
                    className={cn(
                      "inline-block font-[var(--font-mono)] text-[9px] px-2 py-[3px] border rounded-[4px] tracking-[.04em] font-[500] capitalize",
                      pillColor,
                      "border-current"
                    )}
                  >
                    {q.status}
                  </span>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                  {new Date(q.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
