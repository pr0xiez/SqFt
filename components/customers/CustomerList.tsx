"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { SourceBadge } from "@/components/ui/SourceBadge";
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

const SOURCE_ROW_BORDERS: Record<string, string> = {
  phone: "border-l-[var(--sage)]",
  online: "border-l-[var(--gold)]",
  referral: "border-l-[var(--accent)]",
  walkin: "border-l-[var(--muted)]",
  website: "border-l-[var(--ink-2)]",
};

const PIPELINE_FILTERS = [
  { id: "any", label: "Any pipeline" },
  { id: "open", label: "Open estimate" },
  { id: "accepted", label: "Won" },
  { id: "cold", label: "No activity" },
] as const;

type PipelineFilter = (typeof PIPELINE_FILTERS)[number]["id"];

type SortKey = "name" | "source" | "siteMeasures" | "open" | "createdAt";

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
  const [panelOpen, setPanelOpen] = useState(false);
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

  const { data, isLoading } = useCustomers({
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

  const handleSort = (key: SortKey) => {
    setSort(cycleSort(sort, key, key === "createdAt" ? "desc" : "asc"));
  };

  const rowPad = ROW_PADDING[density];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between mb-6 gap-5">
        <div>
          <h1 className="text-[40px] font-[700] leading-[1.02] tracking-[-0.03em]">
            Customers
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-2.5 uppercase tracking-[.08em]">
            <span>
              <span className="text-[var(--ink)] font-[600]">{total}</span>{" "}
              total
            </span>
            <span className="w-px h-3 bg-[var(--line-2)]" />
            <span>
              <span
                className={cn(
                  "font-[600]",
                  totals.openEstimates > 0
                    ? "text-[var(--gold)]"
                    : "text-[var(--muted)]"
                )}
              >
                {totals.openEstimates}
              </span>{" "}
              open
            </span>
            <span className="w-px h-3 bg-[var(--line-2)]" />
            <span>
              <span
                className={cn(
                  "font-[600]",
                  totals.won > 0 ? "text-[var(--sage)]" : "text-[var(--muted)]"
                )}
              >
                {totals.won}
              </span>{" "}
              won
            </span>
          </div>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)}>
          + New Customer
        </Button>
      </div>

      <div className="flex flex-col gap-2.5 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, phone, email…"
          />
          {SOURCES.map((src) => (
            <FilterPill
              key={src}
              active={filter === src}
              count={sourceCounts[src] ?? 0}
              onClick={() => setFilter(src)}
            >
              {src === "all" ? "All" : sourceName(src)}
            </FilterPill>
          ))}
          <DensityToggle
            value={density}
            onChange={setDensity}
            className="ml-auto"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-[var(--font-mono)] text-[9.5px] text-[var(--muted)] uppercase tracking-[.1em] mr-1">
            Pipeline
          </span>
          {PIPELINE_FILTERS.map((p) => (
            <FilterPill
              key={p.id}
              active={pipeline === p.id}
              count={pipelineCounts[p.id]}
              onClick={() => setPipeline(p.id)}
              size="sm"
            >
              {p.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_120px_70px_70px_110px_90px] bg-[var(--surface-2)] border-b border-[var(--line)] sticky top-0 z-[1]">
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
            className="tabular-nums"
          />
          <SortableHeader
            sortKey="open"
            label="Open"
            sort={sort}
            onSort={handleSort}
            align="right"
            className="tabular-nums"
          />
          <SortableHeader
            sortKey="createdAt"
            label="Added"
            sort={sort}
            onSort={handleSort}
          />
          <div className="px-3.5 py-2.5" />
        </div>

        {isLoading ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : total === 0 ? (
          <EmptyState noun="customer" query={query} />
        ) : (
          <>
            {summarized.map(({ customer: c, summary }) => {
              const estCount = summary.siteMeasures;
              const won = summary.accepted > 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className={cn(
                    "w-full text-left grid grid-cols-1 md:grid-cols-[1fr_120px_70px_70px_110px_90px]",
                    "items-center border-b border-[var(--line)] last:border-b-0",
                    "cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]",
                    "border-l-[3px]",
                    SOURCE_ROW_BORDERS[c.source] ?? "border-l-transparent"
                  )}
                >
                  <div className={cn("px-3.5 min-w-0", rowPad)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[14px] font-[600] tracking-[-0.01em] truncate">
                        {c.name}
                      </span>
                      {won && (
                        <span
                          className="font-[var(--font-mono)] text-[8.5px] uppercase tracking-[.1em] px-1.5 py-[1px] rounded-[3px] border shrink-0"
                          style={{
                            color: "var(--sage)",
                            borderColor:
                              "color-mix(in srgb, var(--sage) 50%, transparent)",
                            background:
                              "color-mix(in srgb, var(--sage) 8%, transparent)",
                          }}
                        >
                          Won
                        </span>
                      )}
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] truncate">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ""}
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <SourceBadge source={c.source} />
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block text-right text-[15px] font-[600] tabular-nums",
                      rowPad
                    )}
                  >
                    {estCount}
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block text-right text-[15px] font-[700] tabular-nums",
                      rowPad
                    )}
                    style={{
                      color: summary.open > 0 ? "var(--gold)" : "var(--muted)",
                    }}
                  >
                    {summary.open || "—"}
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)] tabular-nums",
                      rowPad
                    )}
                  >
                    {formatShortDate(c.createdAt)}
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
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              noun="customer"
            />
          </>
        )}
      </div>

      <NewCustomerPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
