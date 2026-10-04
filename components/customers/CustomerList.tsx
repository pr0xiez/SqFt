"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuickCreate } from "@/components/quick-create/QuickCreateProvider";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { PlusIcon, UsersIcon } from "@/components/ui/icons";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { MetaSep, PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Tag } from "@/components/ui/StatusBadge";
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
import { isOpenEstimate } from "@/lib/estimateStatus";
import {
  type CustomerListEstimateSummary,
  type CustomerListItem,
  useCustomers,
} from "@/lib/hooks/useCustomers";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";
import { formatShortDate, sourceName } from "@/lib/utils";

const SOURCES = [
  "all",
  "phone",
  "online",
  "referral",
  "walkin",
  "website",
] as const;

const PIPELINE_FILTERS = [
  { id: "any", label: "Any pipeline" },
  { id: "open", label: "Open estimate" },
  { id: "accepted", label: "Won" },
  { id: "cold", label: "No activity" },
] as const;

type PipelineFilter = (typeof PIPELINE_FILTERS)[number]["id"];

type SortKey = "name" | "source" | "siteMeasures" | "open" | "createdAt";

const GRID_COLS = "md:grid-cols-[minmax(0,1fr)_128px_88px_80px_120px]";

interface CustomerSummary {
  open: number;
  accepted: number;
  total: number;
  siteMeasures: number;
}

function summarize(customer: CustomerListItem): CustomerSummary {
  const siteMeasures = (customer.locations ?? []).flatMap(
    (loc) => loc.siteMeasures
  );
  const estimates: CustomerListEstimateSummary[] = siteMeasures.flatMap(
    (sm) => sm.estimates
  );
  const open = estimates.filter(isOpenEstimate).length;
  const accepted = estimates.filter((q) => q.status === "approved").length;
  return {
    open,
    accepted,
    total: estimates.length,
    siteMeasures: siteMeasures.length,
  };
}

export function CustomerListView() {
  const router = useRouter();
  const [filter, setFilterState] = useState<string>("all");
  const [pipeline, setPipelineState] = useState<PipelineFilter>("any");
  const [query, setQueryState] = useState<string>("");
  const { open: openQuickCreate } = useQuickCreate();
  const debouncedQuery = useDebouncedValue(query, 300);

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
    storageKey: "customers",
    validSortKeys: ["name", "source", "siteMeasures", "open", "createdAt"],
    defaultSort: { key: "createdAt", direction: "desc" },
  });

  const { data, isLoading, isError, refetch } = useCustomers({
    page,
    perPage,
    sort: sort?.key ?? "createdAt",
    dir: sort?.direction ?? "desc",
    q: debouncedQuery,
    source: filter,
    pipeline,
  });

  const setQuery = (v: string) => {
    setQueryState(v);
    setPage(1);
  };
  const setFilter = (v: string) => {
    setFilterState(v);
    setPage(1);
  };
  const setPipeline = (v: PipelineFilter) => {
    setPipelineState(v);
    setPage(1);
  };

  const summarized = (data?.items ?? []).map((c) => ({
    customer: c,
    summary: summarize(c),
  }));

  const sourceCounts: Record<string, number> = {};
  for (const s of SOURCES) sourceCounts[s] = data?.facets[`source:${s}`] ?? 0;
  const pipelineCounts = {
    any: data?.facets["pipeline:any"] ?? 0,
    open: data?.facets["pipeline:open"] ?? 0,
    accepted: data?.facets["pipeline:accepted"] ?? 0,
    cold: data?.facets["pipeline:cold"] ?? 0,
  };

  const totals = data?.summary ?? { openEstimates: 0, won: 0, withOpen: 0 };
  const total = data?.total ?? 0;
  const unfiltered =
    query.trim() === "" && filter === "all" && pipeline === "any";

  const handleSort = (key: SortKey) => {
    setSort(cycleSort(sort, key, key === "createdAt" ? "desc" : "asc"));
  };

  const rowPad = ROW_PADDING[density];

  return (
    <>
      <PageHeader
        title="Customers"
        meta={
          <>
            <span>
              <span className="type-figure text-[var(--ink-2)]">{total}</span>{" "}
              total
            </span>
            <MetaSep />
            <span>
              <span
                className={cn(
                  "type-figure",
                  totals.openEstimates > 0
                    ? "text-[var(--warn)]"
                    : "text-[var(--ink-2)]"
                )}
              >
                {totals.openEstimates}
              </span>{" "}
              open
            </span>
            <MetaSep />
            <span>
              <span
                className={cn(
                  "type-figure",
                  totals.won > 0 ? "text-[var(--ok)]" : "text-[var(--ink-2)]"
                )}
              >
                {totals.won}
              </span>{" "}
              won
            </span>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => openQuickCreate("customer")}>
            <PlusIcon aria-hidden="true" />
            New Customer
          </Button>
        }
      />

      <ListToolbar
        className="mb-2.5"
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, phone, email…"
          />
        }
        filters={SOURCES.map((src) => (
          <FilterPill
            key={src}
            active={filter === src}
            count={sourceCounts[src] ?? 0}
            onClick={() => setFilter(src)}
          >
            {src === "all" ? "All" : sourceName(src)}
          </FilterPill>
        ))}
        trailing={
          <DensityToggle
            value={density}
            onChange={setDensity}
            className="hidden md:inline-flex"
          />
        }
      />
      <ListToolbar
        filters={
          <>
            <span className="type-label shrink-0 mr-1">Pipeline</span>
            {PIPELINE_FILTERS.map((p) => (
              <FilterPill
                key={p.id}
                active={pipeline === p.id}
                count={pipelineCounts[p.id]}
                onClick={() => setPipeline(p.id)}
              >
                {p.label}
              </FilterPill>
            ))}
          </>
        }
      />

      <div className={TABLE_SHELL}>
        <div className={cn(TABLE_HEAD, GRID_COLS)}>
          <SortableHeader
            sortKey="name"
            label="Customer"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="source"
            label="Source"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="siteMeasures"
            label="Est."
            sort={sort}
            onSort={handleSort}
            align="right"
          />
          <SortableHeader
            sortKey="open"
            label="Open"
            sort={sort}
            onSort={handleSort}
            align="right"
          />
          <SortableHeader
            sortKey="createdAt"
            label="Added"
            sort={sort}
            onSort={handleSort}
          />
        </div>

        {isLoading ? (
          <LoadingRows />
        ) : isError ? (
          <ErrorState
            message="Something went wrong loading customers."
            action={
              <Button variant="default" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        ) : total === 0 && unfiltered ? (
          <EmptyState
            icon={UsersIcon}
            title="No customers yet."
            body="Add a lead with New Customer, then measure their site."
          />
        ) : total === 0 ? (
          <EmptyState noun="customer" query={query} />
        ) : (
          <>
            {summarized.map(({ customer: c, summary }) => {
              const won = summary.accepted > 0;
              const contact = [c.phone, c.email].filter(Boolean).join(" · ");
              return (
                <button
                  key={c.id}
                  type="button"
                  data-customer-row=""
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className={cn(TABLE_ROW, "grid-cols-1", GRID_COLS)}
                >
                  <div className={cn(CELL, "min-w-0", rowPad)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(CELL_PRIMARY, "truncate")}>
                        {c.name}
                      </span>
                      {won && (
                        <Tag tone="ok" className="shrink-0">
                          Won
                        </Tag>
                      )}
                    </div>
                    {contact && <div className={CELL_SUB}>{contact}</div>}
                    {/* phones: the columns fold into one meta line */}
                    <div className="md:hidden mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--muted)]">
                      <SourceBadge source={c.source} />
                      {summary.open > 0 && (
                        <span>
                          <span className="type-figure text-[var(--warn)]">
                            {summary.open}
                          </span>{" "}
                          open
                        </span>
                      )}
                      <span>Added {formatShortDate(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <SourceBadge source={c.source} />
                  </div>
                  <div
                    className={cn(CELL, "hidden md:block text-right", rowPad)}
                  >
                    <span className={cn(CELL_FIGURE, "font-[600]")}>
                      {summary.siteMeasures}
                    </span>
                  </div>
                  <div
                    className={cn(CELL, "hidden md:block text-right", rowPad)}
                  >
                    <span
                      className={cn(
                        CELL_FIGURE,
                        "font-[600]",
                        summary.open > 0
                          ? "text-[var(--warn)]"
                          : "text-[var(--muted)]"
                      )}
                    >
                      {summary.open || "-"}
                    </span>
                  </div>
                  <div
                    className={cn(CELL, CELL_META, "hidden md:block", rowPad)}
                  >
                    {formatShortDate(c.createdAt)}
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
              noun="customer"
            />
          </>
        )}
      </div>
    </>
  );
}
