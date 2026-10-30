"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { ArrowCounterClockwiseIcon, FileTextIcon } from "@/components/ui/icons";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { StatusBadge, Tag } from "@/components/ui/StatusBadge";
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
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUSES,
} from "@/lib/estimateStatus";
import type { EstimateStatusFilter } from "@/lib/estimates/statusFilter";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";
import { fmtBig, formatShortDate } from "@/lib/utils";

const STATUS_FILTERS: { value: EstimateStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...ESTIMATE_STATUSES.map((value) => ({
    value,
    label: ESTIMATE_STATUS_LABELS[value],
  })),
];

const GRID_COLS = "md:grid-cols-[92px_minmax(0,1fr)_120px_120px_124px_120px]";

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
  const statusCounts: Record<EstimateStatusFilter, number> = {
    all: facets.all ?? 0,
    draft: facets.draft ?? 0,
    sent: facets.sent ?? 0,
    viewed: facets.viewed ?? 0,
    approved: facets.approved ?? 0,
    declined: facets.declined ?? 0,
  };

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
      <PageHeader
        title="Estimates"
        meta={
          <span>
            <span className="type-figure text-[var(--ink-2)]">{allCount}</span>{" "}
            estimate{allCount === 1 ? "" : "s"}
          </span>
        }
      />

      <ListToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search estimate #, customer, site measure…"
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
            sortKey="number"
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
            sortKey="siteMeasure"
            label="Site measure"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="total"
            label="Total"
            sort={sort}
            onSort={handleSort}
            align="right"
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
          <LoadingRows />
        ) : isError ? (
          <ErrorState
            message="Something went wrong loading estimates."
            action={
              <Button variant="default" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        ) : allCount === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title="No estimates yet."
            body="Estimates start from a site measure. Measure the rooms, then price the job."
          />
        ) : total === 0 ? (
          <EmptyState noun="estimate" query={query} />
        ) : (
          <>
            {estimates.map((q) => {
              const customer = q.siteMeasure.location?.customer;
              const locationAddress = q.siteMeasure.location?.address;
              const estimateLabel = `#${q.siteMeasure.siteMeasureNumber ?? q.siteMeasure.id}`;
              const totalLabel = q.total === null ? "-" : `${fmtBig(q.total)}`;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => router.push(`/estimates/${q.id}`)}
                  className={cn(TABLE_ROW, "grid-cols-1", GRID_COLS)}
                >
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          CELL_FIGURE,
                          "font-[600] text-[var(--ink)]"
                        )}
                      >
                        #{q.estimateNumber}
                      </span>
                      {q.revisedFromId && (
                        <Tag
                          icon={ArrowCounterClockwiseIcon}
                          title="Revised estimate"
                          className="h-[20px] px-1.5 text-[12px]"
                        >
                          Rev
                        </Tag>
                      )}
                    </div>
                  </div>
                  <div className={cn(CELL, "min-w-0", rowPad)}>
                    <div className={CELL_PRIMARY}>{customer?.name ?? "-"}</div>
                    <div className={cn(CELL_SUB, "hidden md:block")}>
                      {locationAddress ?? ""}
                    </div>
                    {/* phones: the columns fold into one meta line */}
                    <div className="md:hidden mt-1.5 flex items-center gap-2 text-[13px] text-[var(--muted)]">
                      <span className="type-figure text-[var(--ink-2)]">
                        #{q.estimateNumber}
                      </span>
                      <span className="type-figure">{totalLabel}</span>
                      <StatusBadge status={q.status} />
                    </div>
                  </div>
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <span className={cn(CELL_FIGURE, "text-[var(--ink-2)]")}>
                      {estimateLabel}
                    </span>
                  </div>
                  <div
                    className={cn(CELL, "hidden md:block text-right", rowPad)}
                  >
                    <span className={cn(CELL_FIGURE, "font-[600]")}>
                      {totalLabel}
                    </span>
                  </div>
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <StatusBadge status={q.status} />
                  </div>
                  <div
                    className={cn(CELL, CELL_META, "hidden md:block", rowPad)}
                  >
                    {formatShortDate(q.date)}
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
