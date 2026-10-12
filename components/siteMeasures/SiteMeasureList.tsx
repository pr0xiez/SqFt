"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SiteMeasureStatus } from "@/components/siteMeasures/filterSiteMeasures";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { CaretRightIcon, RulerIcon } from "@/components/ui/icons";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import {
  CELL,
  CELL_FIGURE,
  CELL_META,
  CELL_PRIMARY,
  CELL_SUB,
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_SHELL,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useSiteMeasures } from "@/lib/hooks/useSiteMeasures";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";
import { formatShortDate } from "@/lib/utils";

const STATUS_FILTERS: { value: SiteMeasureStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "empty", label: "No rooms" },
  { value: "measured", label: "Measured" },
  { value: "estimated", label: "Estimated" },
];

const GRID_COLS = "md:grid-cols-[92px_minmax(0,1fr)_140px_56px]";

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
  const { data, isLoading, isError, refetch } = useSiteMeasures({
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
      <PageHeader
        title="Site Measures"
        meta={
          <span>
            <span className="type-figure text-[var(--ink-2)]">{allCount}</span>{" "}
            site measure{allCount === 1 ? "" : "s"}
          </span>
        }
      />

      <ListToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by # or customer name…"
          />
        }
        filters={STATUS_FILTERS.map(({ value, label }) => (
          <FilterPill
            key={value}
            active={status === value}
            count={statusCounts[value]}
            onClick={() => setStatus(value)}
          >
            {label}
          </FilterPill>
        ))}
        trailing={
          <>
            {isNarrowed && (
              <span className="text-[13px] text-[var(--muted)]">
                <span className="type-figure">{total}</span> of{" "}
                <span className="type-figure">{allCount}</span>
              </span>
            )}
            <DensityToggle
              value={density}
              onChange={setDensity}
              className="hidden md:inline-flex"
            />
          </>
        }
      />

      <div className={TABLE_SHELL}>
        <div className={cn(TABLE_HEAD, GRID_COLS)}>
          <SortableHeader
            sortKey="id"
            label="#"
            sort={sort}
            onSort={handleSort}
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
          <div aria-hidden="true" />
        </div>

        {isLoading ? (
          <LoadingRows />
        ) : isError ? (
          <ErrorState
            message="Something went wrong loading site measures."
            action={
              <Button variant="default" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        ) : allCount === 0 ? (
          <EmptyState
            icon={RulerIcon}
            title="No site measures yet."
            body="Create one from a customer record."
          />
        ) : total === 0 ? (
          <EmptyState noun="site measure" query={query} />
        ) : (
          <>
            {siteMeasures.map((est) => {
              const dateLabel = formatShortDate(est.date);
              return (
                <button
                  key={est.id}
                  type="button"
                  onClick={() => router.push(`/site-measures/${est.id}`)}
                  className={cn(TABLE_ROW, "group grid-cols-1", GRID_COLS)}
                >
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <span
                      className={cn(
                        CELL_FIGURE,
                        "font-[600] text-[var(--ink)]"
                      )}
                    >
                      #{est.id}
                    </span>
                  </div>
                  <div className={cn(CELL, "min-w-0", rowPad)}>
                    <div className={CELL_PRIMARY}>
                      {est.location?.customer?.name || "-"}
                    </div>
                    <div className={CELL_SUB}>
                      {est.location?.address ?? ""}
                    </div>
                    {/* phones: the columns fold into one meta line */}
                    <div className="md:hidden mt-1.5 flex items-center gap-2 text-[13px] text-[var(--muted)]">
                      <span className="type-figure text-[var(--ink-2)]">
                        #{est.id}
                      </span>
                      <span>{dateLabel}</span>
                    </div>
                  </div>
                  <div
                    className={cn(CELL, CELL_META, "hidden md:block", rowPad)}
                  >
                    {dateLabel}
                  </div>
                  <div
                    className={cn(
                      CELL,
                      "hidden md:flex justify-end text-[var(--muted)] group-hover:text-[var(--ink)]",
                      rowPad
                    )}
                  >
                    <CaretRightIcon
                      aria-hidden="true"
                      className="size-4 transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5"
                    />
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
              noun="site measure"
            />
          </>
        )}
      </div>
    </>
  );
}
