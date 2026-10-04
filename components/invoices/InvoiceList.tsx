"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InvoiceStatusFilter } from "@/components/invoices/filterInvoices";
import { Button } from "@/components/ui/Button";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { CheckCircleIcon, ReceiptIcon } from "@/components/ui/icons";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  CELL,
  CELL_FIGURE,
  CELL_META,
  CELL_PRIMARY,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_ROW,
  TABLE_SHELL,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useInvoiceList } from "@/lib/hooks/useInvoices";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { isInvoiceOverdue } from "@/lib/invoices";
import { cycleSort } from "@/lib/sort";
import { fmtDollar } from "@/lib/utils";

const STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const GRID_COLS =
  "md:grid-cols-[84px_minmax(0,1fr)_120px_120px_112px_116px_116px]";

type SortKey = "number" | "customer" | "amount" | "dueDate" | "sentAt";

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InvoiceListView() {
  const router = useRouter();
  const [query, setQueryState] = useState<string>("");
  const [status, setStatusState] = useState<InvoiceStatusFilter>("all");

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
    storageKey: "invoices",
    validSortKeys: ["number", "customer", "amount", "dueDate", "sentAt"],
    defaultSort: { key: "sentAt", direction: "desc" },
  });

  const setQuery = (v: string) => {
    setQueryState(v);
    setPage(1);
  };
  const setStatus = (v: InvoiceStatusFilter) => {
    setStatusState(v);
    setPage(1);
  };

  const debouncedQuery = useDebouncedValue(query, 300);
  const sortKey = sort?.key ?? "sentAt";
  const sortDir = sort?.direction ?? "desc";
  const { data, isLoading, isError, refetch } = useInvoiceList({
    page,
    perPage,
    sort: sortKey,
    dir: sortDir,
    q: debouncedQuery,
    status,
  });
  const invoices = data?.items ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? {};
  const statusCounts = {
    all: facets.all ?? 0,
    open: facets.open ?? 0,
    draft: facets.draft ?? 0,
    paid: facets.paid ?? 0,
    void: facets.void ?? 0,
  } as Record<InvoiceStatusFilter, number>;

  const handleSort = (key: SortKey) => {
    const defaultDir = key === "customer" ? "asc" : "desc";
    setSort(cycleSort(sort, key, defaultDir));
  };

  const allCount = facets.all ?? 0;
  const isNarrowed = total !== allCount;
  const rowPad = ROW_PADDING[density];

  return (
    <>
      <PageHeader
        title="Invoices"
        meta={
          <span>
            <span className="type-figure text-[var(--ink-2)]">{allCount}</span>{" "}
            invoice{allCount === 1 ? "" : "s"}
          </span>
        }
      />

      <ListToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search invoice #, customer…"
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
            sortKey="amount"
            label="Amount"
            sort={sort}
            onSort={handleSort}
            align="right"
          />
          <div className={cn(TABLE_HEAD_CELL, "text-right")}>Balance due</div>
          <div className={TABLE_HEAD_CELL}>Status</div>
          <SortableHeader
            sortKey="dueDate"
            label="Due"
            sort={sort}
            onSort={handleSort}
          />
          <SortableHeader
            sortKey="sentAt"
            label="Sent"
            sort={sort}
            onSort={handleSort}
          />
        </div>

        {isLoading ? (
          <LoadingRows />
        ) : isError ? (
          <ErrorState
            message="Something went wrong loading invoices."
            action={
              <Button variant="default" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        ) : allCount === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title="No invoices yet."
            body="Invoices are billed from approved estimates."
          />
        ) : total === 0 ? (
          status === "open" && !query ? (
            <EmptyState
              icon={CheckCircleIcon}
              title="No open invoices. Everything sent has been paid."
            />
          ) : (
            <EmptyState noun="invoice" query={query} />
          )
        ) : (
          <>
            {invoices.map((row) => {
              const overdue = isInvoiceOverdue(row);

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => router.push(`/invoices/${row.id}`)}
                  className={cn(TABLE_ROW, "grid-cols-1", GRID_COLS)}
                >
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <span
                      className={cn(
                        CELL_FIGURE,
                        "font-[600] text-[var(--ink)]"
                      )}
                    >
                      #{row.invoiceNumber}
                    </span>
                  </div>
                  <div className={cn(CELL, "min-w-0", rowPad)}>
                    <div className={CELL_PRIMARY}>
                      {row.customerName ?? "-"}
                    </div>
                    {/* phones: the columns fold into one meta line */}
                    <div className="md:hidden mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--muted)]">
                      {/* split so the number isn't a second exact "#N" match */}
                      <span className="type-figure text-[var(--ink-2)]">
                        <span>#</span>
                        {row.invoiceNumber}
                      </span>
                      <span
                        className={cn(
                          "type-figure",
                          overdue && "text-[var(--accent-ink)]"
                        )}
                        title={overdue ? "Overdue" : undefined}
                      >
                        {fmtDollar(row.balanceDue)} due
                      </span>
                      <StatusBadge status={row.status} />
                    </div>
                  </div>
                  <div
                    className={cn(CELL, "hidden md:block text-right", rowPad)}
                  >
                    <span className={cn(CELL_FIGURE, "font-[600]")}>
                      {fmtDollar(row.amount)}
                    </span>
                  </div>
                  <div
                    className={cn(CELL, "hidden md:block text-right", rowPad)}
                  >
                    <span className={cn(CELL_FIGURE, "text-[var(--ink-2)]")}>
                      {fmtDollar(row.balanceDue)}
                    </span>
                  </div>
                  <div className={cn(CELL, "hidden md:block", rowPad)}>
                    <StatusBadge status={row.status} />
                  </div>
                  <div
                    className={cn(
                      CELL,
                      "hidden md:block text-[13.5px]",
                      overdue
                        ? "text-[var(--accent-ink)] font-[560]"
                        : "text-[var(--muted)]",
                      rowPad
                    )}
                    title={overdue ? "Overdue" : undefined}
                  >
                    {fmtDate(row.dueDate)}
                  </div>
                  <div
                    className={cn(CELL, CELL_META, "hidden md:block", rowPad)}
                  >
                    {fmtDate(row.sentAt)}
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
              noun="invoice"
            />
          </>
        )}
      </div>
    </>
  );
}
