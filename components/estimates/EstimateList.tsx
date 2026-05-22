"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  type EstimateStatus,
  filterEstimates,
} from "@/components/estimates/filterEstimates";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { paginate, useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort, sortBy } from "@/lib/sort";

const STATUS_FILTERS: { value: EstimateStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "empty", label: "No rooms" },
  { value: "measured", label: "Measured" },
  { value: "quoted", label: "Quoted" },
];

type SortKey = "id" | "customer" | "date";

export function EstimateListView() {
  const router = useRouter();
  const { data: estimates = [], isLoading } = useEstimates();
  const [query, setQueryState] = useState<string>("");
  const [status, setStatusState] = useState<EstimateStatus>("all");

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
    validSortKeys: ["id", "customer", "date"],
    defaultSort: { key: "date", direction: "desc" },
  });

  const setQuery = (v: string) => {
    setQueryState(v);
    setPage(1);
  };
  const setStatus = (v: EstimateStatus) => {
    setStatusState(v);
    setPage(1);
  };

  const statusCounts = useMemo(() => {
    const counts: Record<EstimateStatus, number> = {
      all: estimates.length,
      empty: 0,
      measured: 0,
      quoted: 0,
    };
    for (const e of estimates) {
      const roomCount = (e.items ?? []).filter((i) => i.type === "room").length;
      const quoteCount = e.quotes?.length ?? 0;
      if (roomCount === 0) counts.empty += 1;
      else if (quoteCount === 0) counts.measured += 1;
      else counts.quoted += 1;
    }
    return counts;
  }, [estimates]);

  const filtered = useMemo(
    () => filterEstimates(estimates, query, status),
    [estimates, query, status]
  );

  const sorted = useMemo(
    () =>
      sortBy(filtered, sort, {
        id: (e) => e.id,
        customer: (e) => e.customer?.name ?? e.title ?? "",
        date: (e) => new Date(e.date),
      }),
    [filtered, sort]
  );

  const { slice, safePage, total } = paginate(sorted, page, perPage);

  const handleSort = (key: SortKey) => {
    setSort(cycleSort(sort, key, key === "date" ? "desc" : "asc"));
  };

  const isNarrowed = filtered.length !== estimates.length;
  const rowPad = ROW_PADDING[density];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Estimates
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2 tabular-nums">
            {estimates.length} estimate{estimates.length === 1 ? "" : "s"}
          </div>
        </div>
        <Button variant="primary" onClick={() => router.push("/customers")}>
          + New Estimate
        </Button>
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
            {filtered.length} of {estimates.length}
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
        ) : estimates.length === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No estimates yet. Create one from a customer record.
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState noun="estimate" query={query} />
        ) : (
          <>
            {slice.map((est) => (
              <button
                key={est.id}
                type="button"
                onClick={() => router.push(`/estimates/${est.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_110px_80px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
              >
                <div className={cn("px-3.5 hidden md:block", rowPad)}>
                  <span className="font-[var(--font-mono)] text-[13px] font-[600] tabular-nums">
                    #{est.id}
                  </span>
                </div>
                <div className={cn("px-3.5", rowPad)}>
                  <div className="text-[14px] font-[600] tracking-[-0.01em]">
                    {est.title || est.customer?.name || "—"}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap">
                    {est.title
                      ? (est.customer?.name ?? "")
                      : (est.customer?.address ?? "")}
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
              page={safePage}
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
