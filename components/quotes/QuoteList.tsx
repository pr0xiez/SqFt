"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  filterQuotes,
  type QuoteStatusFilter,
} from "@/components/quotes/filterQuotes";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { paginate, useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort, sortBy } from "@/lib/sort";
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

type SortKey = "number" | "customer" | "estimate" | "total" | "status" | "date";

export function QuoteListView() {
  const router = useRouter();
  const { data: quotes = [], isLoading } = useQuotes();
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<QuoteStatusFilter>("all");

  const {
    sort,
    page,
    perPage,
    density,
    setSort,
    setPage,
    setPerPage,
    setDensity,
    resetPage,
  } = useTableQueryState<SortKey>({
    storageKey: "quotes",
    validSortKeys: [
      "number",
      "customer",
      "estimate",
      "total",
      "status",
      "date",
    ],
    defaultSort: { key: "date", direction: "desc" },
  });

  const statusCounts = useMemo(() => {
    const counts: Record<QuoteStatusFilter, number> = {
      all: quotes.length,
      draft: 0,
      sent: 0,
      accepted: 0,
      declined: 0,
    };
    for (const q of quotes) {
      if (q.status in counts) {
        counts[q.status as QuoteStatusFilter] += 1;
      }
    }
    return counts;
  }, [quotes]);

  const filtered = useMemo(
    () => filterQuotes(quotes, query, status),
    [quotes, query, status]
  );

  const sorted = useMemo(
    () =>
      sortBy(filtered, sort, {
        number: (q) => q.quoteNumber,
        customer: (q) => q.estimate.customer?.name ?? "",
        estimate: (q) => q.estimate.estimateNumber ?? q.estimate.id,
        total: (q) => q.total ?? 0,
        status: (q) => q.status,
        date: (q) => new Date(q.date),
      }),
    [filtered, sort]
  );

  const { slice, safePage, pageCount, total } = paginate(sorted, page, perPage);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on filter change
  useEffect(() => {
    if (safePage > 1 && pageCount === 1) return;
    resetPage();
  }, [query, status]);

  const handleSort = (key: SortKey) => {
    const defaultDir =
      key === "date" || key === "total" || key === "number" ? "desc" : "asc";
    setSort(cycleSort(sort, key, defaultDir));
  };

  const isNarrowed = filtered.length !== quotes.length;
  const trimmedQuery = query.trim();
  const rowPad = ROW_PADDING[density];

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Quotes
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2 tabular-nums">
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
          <FilterPill
            key={value}
            active={status === value}
            count={statusCounts[value]}
            onClick={() => setStatus(value)}
          >
            {label}
          </FilterPill>
        ))}
        <DensityToggle
          value={density}
          onChange={setDensity}
          className="ml-auto"
        />
        {isNarrowed && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tabular-nums">
            {filtered.length} of {quotes.length}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row (desktop only) */}
        <div className="hidden md:grid grid-cols-[80px_1fr_120px_120px_110px_110px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          <SortableHeader
            sortKey="number"
            label="#"
            sort={sort}
            onSort={handleSort}
            className="tabular-nums"
          />
          <SortableHeader
            sortKey="customer"
            label="Customer"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="estimate"
            label="Estimate"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="total"
            label="Total"
            sort={sort}
            onSort={handleSort}
            className="tabular-nums"
          />
          <SortableHeader
            sortKey="status"
            label="Status"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="date"
            label="Date"
            sort={sort}
            onSort={handleSort}
          />
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
          <div className="px-6 py-10 flex flex-col items-start gap-2">
            <div className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.12em] text-[var(--muted)]">
              No results
            </div>
            <div className="text-[14px] text-[var(--ink-2)]">
              {trimmedQuery.length > 0
                ? `No quotes match "${trimmedQuery}".`
                : "No quotes match."}
            </div>
          </div>
        ) : (
          <>
            {slice.map((q) => {
              const customer = q.estimate.customer;
              const estimateLabel = `#${q.estimate.estimateNumber ?? q.estimate.id}`;
              const totalLabel = q.total === null ? "—" : `${fmtBig(q.total)}`;
              const pillColor =
                STATUS_PILL_COLOR[q.status] ?? "text-[var(--muted)]";

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => router.push(`/quotes/${q.id}`)}
                  className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_120px_120px_110px_110px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
                >
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-[var(--font-mono)] text-[13px] font-[600] tabular-nums">
                        #{q.quoteNumber}
                      </span>
                      {q.revisedFromId && (
                        <span
                          className="ml-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[.04em] text-[var(--muted)] border border-[var(--line-2)] rounded-sm px-1"
                          title="Revised quote"
                        >
                          ↶ rev
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={cn("px-3.5", rowPad)}>
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
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="font-[var(--font-mono)] text-[13px] tabular-nums">
                      {estimateLabel}
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="text-[13px] font-[600] tabular-nums">
                      {totalLabel}
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
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
                  <div
                    className={cn(
                      "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]",
                      rowPad
                    )}
                  >
                    {new Date(q.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </button>
              );
            })}
            <Pagination
              total={total}
              page={safePage}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              noun="quote"
            />
          </>
        )}
      </div>
    </>
  );
}

function FilterPill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-[var(--font-mono)] text-[11px] px-3 py-1.5 border rounded-[6px] cursor-pointer transition-colors duration-150",
        "inline-flex items-center gap-1.5",
        active
          ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
          : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
      )}
    >
      <span>{children}</span>
      {count > 0 && (
        <span
          className={cn(
            "font-[var(--font-mono)] text-[9.5px] tabular-nums leading-none",
            active ? "text-[var(--bg)]/70" : "text-[var(--muted)]"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
