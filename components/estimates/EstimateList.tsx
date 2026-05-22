"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type EstimateStatus,
  filterEstimates,
} from "@/components/estimates/filterEstimates";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { paginate, useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort, sortBy } from "@/lib/sort";
import { estTotalArea } from "@/lib/utils";

const STATUS_FILTERS: { value: EstimateStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "empty", label: "No rooms" },
  { value: "measured", label: "Measured" },
  { value: "quoted", label: "Quoted" },
];

type SortKey = "id" | "customer" | "area" | "date";

export function EstimateListView() {
  const router = useRouter();
  const { data: estimates = [], isLoading } = useEstimates();
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<EstimateStatus>("all");

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
    storageKey: "estimates",
    validSortKeys: ["id", "customer", "area", "date"],
    defaultSort: { key: "date", direction: "desc" },
  });

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
        area: (e) => (e.items ? estTotalArea(e.items) : 0),
        date: (e) => new Date(e.date),
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
    setSort(cycleSort(sort, key, key === "date" ? "desc" : "asc"));
  };

  const isNarrowed = filtered.length !== estimates.length;
  const trimmedQuery = query.trim();
  const rowPad = ROW_PADDING[density];

  return (
    <>
      {/* Header */}
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

      {/* Filter bar */}
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

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[80px_1fr_130px_110px_80px] bg-[var(--surface-2)] border-b border-[var(--line)]">
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
            sortKey="area"
            label="Area"
            sort={sort}
            onSort={handleSort}
            className="tabular-nums"
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
          <div className="px-6 py-10 flex flex-col items-start gap-2">
            <div className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.12em] text-[var(--muted)]">
              No results
            </div>
            <div className="text-[14px] text-[var(--ink-2)]">
              {trimmedQuery.length > 0
                ? `No estimates match "${trimmedQuery}".`
                : "No estimates match."}
            </div>
          </div>
        ) : (
          <>
            {slice.map((est) => {
              const area = est.items ? estTotalArea(est.items) : 0;
              const roomCount =
                est.items?.filter((i) => i.type === "room").length ?? 0;

              return (
                <button
                  key={est.id}
                  type="button"
                  onClick={() => router.push(`/estimates/${est.id}`)}
                  className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_130px_110px_80px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
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
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="text-[13px] font-[600] tabular-nums">
                      {area > 0 ? `${Math.round(area)} sqft` : "—"}
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-px tabular-nums">
                      {roomCount} room{roomCount === 1 ? "" : "s"}
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
              );
            })}
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
