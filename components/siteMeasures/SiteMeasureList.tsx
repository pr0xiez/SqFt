"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SiteMeasureStatus } from "@/components/siteMeasures/filterSiteMeasures";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useSiteMeasures } from "@/lib/hooks/useSiteMeasures";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";

const STATUS_FILTERS: { value: SiteMeasureStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "empty", label: "No rooms" },
  { value: "measured", label: "Measured" },
  { value: "estimated", label: "Estimated" },
];

type SortKey = "id" | "customer" | "date";

export function SiteMeasureListView() {
  const router = useRouter();
  const [query, setQueryState] = useState<string>("");
  const [status, setStatusState] = useState<SiteMeasureStatus>("all");

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
    storageKey: "siteMeasures",
    validSortKeys: ["id", "customer", "date"],
    defaultSort: { key: "date", direction: "desc" },
  });

  const setQuery = (v: string) => {
    setQueryState(v);
    setPage(1);
  };
  const setStatus = (v: SiteMeasureStatus) => {
    setStatusState(v);
    setPage(1);
  };

  const debouncedQuery = useDebouncedValue(query, 300);
  const sortKey = sort?.key ?? "date";
  const sortDir = sort?.direction ?? "desc";
  const { data, isLoading } = useSiteMeasures({
    page,
    perPage,
    sort: sortKey,
    dir: sortDir,
    q: debouncedQuery,
    status,
  });
  const siteMeasures = data?.items ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? {};
  const allCount = facets.all ?? 0;
  const statusCounts = {
    all: allCount,
    empty: facets.empty ?? 0,
    measured: facets.measured ?? 0,
    estimated: facets.estimated ?? 0,
  } as Record<SiteMeasureStatus, number>;

  const handleSort = (key: SortKey) => {
    setSort(cycleSort(sort, key, key === "date" ? "desc" : "asc"));
  };

  const isNarrowed = total !== allCount;
  const rowPad = ROW_PADDING[density];

  return (
    <>
      <div className="mb-7">
        <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
          Site Measures
        </h1>
        <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2 tabular-nums">
          {allCount} site measure{allCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by # or customer name…"
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
        <div className="hidden md:grid grid-cols-[80px_1fr_110px_80px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          <SortableHeader
            sortKey="id"
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
            sortKey="date"
            label="Date"
            sort={sort}
            onSort={handleSort}
          />
          <div className="px-3.5 py-2.5" />
        </div>

        {isLoading ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : allCount === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No site measures yet. Create one from a customer record.
          </div>
        ) : total === 0 ? (
          <EmptyState noun="site measure" query={query} />
        ) : (
          <>
            {siteMeasures.map((est) => (
              <button
                key={est.id}
                type="button"
                onClick={() => router.push(`/site-measures/${est.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_110px_80px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
              >
                <div className={cn("px-3.5 hidden md:block", rowPad)}>
                  <span className="font-[var(--font-mono)] text-[13px] font-[600] tabular-nums">
                    #{est.id}
                  </span>
                </div>
                <div className={cn("px-3.5", rowPad)}>
                  <div className="text-[14px] font-[600] tracking-[-0.01em]">
                    {est.title || est.location?.customer?.name || "—"}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap">
                    {est.title
                      ? (est.location?.customer?.name ?? "")
                      : (est.location?.address ?? "")}
                  </div>
                </div>
                <div
                  className={cn(
                    "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]",
                    rowPad
                  )}
                >
                  {new Date(est.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div className={cn("px-3.5 hidden md:block", rowPad)}>
                  <span className="inline-block whitespace-nowrap font-[var(--font-mono)] text-[10px] px-3 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[5px] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors duration-150">
                    Open →
                  </span>
                </div>
              </button>
            ))}
            <Pagination
              total={total}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              noun="site measure"
            />
          </>
        )}
      </div>
    </>
  );
}
