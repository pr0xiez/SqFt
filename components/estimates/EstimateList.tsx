"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import type { EstimateStatusFilter } from "@/lib/estimates/statusFilter";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";
import { fmtBig } from "@/lib/utils";

const STATUS_FILTERS: { value: EstimateStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

const STATUS_PILL_COLOR: Record<string, string> = {
  draft: "text-[var(--muted)]",
  sent: "text-[var(--gold)]",
  approved: "text-[var(--sage)]",
  declined: "text-[var(--accent)]",
};

type SortKey =
  | "number"
  | "customer"
  | "siteMeasure"
  | "total"
  | "status"
  | "date";

export function EstimateListView() {
  const router = useRouter();
  const [query, setQueryState] = useState<string>("");
  const [status, setStatusState] = useState<EstimateStatusFilter>("all");

  const {
    sort,
    page,
    perPage,
    density,
    setSort,
    setPage,
    setPerPage,
    setDensity,
  } = useTableQueryState<SortKey>({
    storageKey: "estimates",
    validSortKeys: [
      "number",
      "customer",
      "siteMeasure",
      "total",
      "status",
      "date",
    ],
    defaultSort: { key: "date", direction: "desc" },
  });

  const setQuery = (v: string) => {
    setQueryState(v);
    setPage(1);
  };
  const setStatus = (v: EstimateStatusFilter) => {
    setStatusState(v);
    setPage(1);
  };

  const debouncedQuery = useDebouncedValue(query, 300);
  const sortKey = sort?.key ?? "date";
  const sortDir = sort?.direction ?? "desc";
  const { data, isLoading, isError, refetch } = useEstimates({
    page,
    perPage,
    sort: sortKey,
    dir: sortDir,
    q: debouncedQuery,
    status,
  });
  const estimates = data?.items ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? {};
  const statusCounts = {
    all: facets.all ?? 0,
    draft: facets.draft ?? 0,
    sent: facets.sent ?? 0,
    approved: facets.approved ?? 0,
    declined: facets.declined ?? 0,
  } as Record<EstimateStatusFilter, number>;

  const handleSort = (key: SortKey) => {
    const defaultDir =
      key === "date" || key === "total" || key === "number" ? "desc" : "asc";
    setSort(cycleSort(sort, key, defaultDir));
  };

  const allCount = facets.all ?? 0;
  const isNarrowed = total !== allCount;
  const rowPad = ROW_PADDING[density];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Estimates
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2 tabular-nums">
            {allCount} estimate{allCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search estimate #, customer, site measure…"
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
            {total} of {allCount}
          </span>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
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
            sortKey="siteMeasure"
            label="Site Measure"
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
        ) : isError ? (
          <div className="p-6 flex flex-col items-start gap-2.5">
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--accent)]">
              Something went wrong loading estimates.
            </div>
            <Button variant="default" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : allCount === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No estimates yet.
          </div>
        ) : total === 0 ? (
          <EmptyState noun="estimate" query={query} />
        ) : (
          <>
            {estimates.map((q) => {
              const customer = q.siteMeasure.location?.customer;
              const locationAddress = q.siteMeasure.location?.address;
              const estimateLabel = `#${q.siteMeasure.siteMeasureNumber ?? q.siteMeasure.id}`;
              const totalLabel = q.total === null ? "—" : `${fmtBig(q.total)}`;
              const pillColor =
                STATUS_PILL_COLOR[q.status] ?? "text-[var(--muted)]";

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => router.push(`/estimates/${q.id}`)}
                  className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_120px_120px_110px_110px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
                >
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-[var(--font-mono)] text-[13px] font-[600] tabular-nums">
                        #{q.estimateNumber}
                      </span>
                      {q.revisedFromId && (
                        <span
                          className="ml-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[.04em] text-[var(--muted)] border border-[var(--line-2)] rounded-sm px-1"
                          title="Revised estimate"
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
                      #{q.estimateNumber} · {totalLabel} ·{" "}
                      <span className={pillColor}>{q.status}</span>
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap hidden md:block">
                      {locationAddress ?? ""}
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
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              noun="estimate"
            />
          </>
        )}
      </div>
    </>
  );
}
