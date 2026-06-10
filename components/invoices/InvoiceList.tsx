"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type InvoiceStatusFilter,
  OPEN_INVOICE_STATUSES,
} from "@/components/invoices/filterInvoices";
import { DensityToggle, ROW_PADDING } from "@/components/ui/DensityToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { type InvoiceListRow, useInvoiceList } from "@/lib/hooks/useInvoices";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";
import { cycleSort } from "@/lib/sort";
import { fmtDollar } from "@/lib/utils";

const STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const STATUS_PILL_COLOR: Record<string, string> = {
  draft: "text-[var(--muted)]",
  sent: "text-[var(--gold)]",
  viewed: "text-[var(--gold)]",
  partial: "text-[var(--gold)]",
  paid: "text-[var(--sage)]",
  void: "text-[var(--accent)]",
};

const OPEN_SET = new Set<string>(OPEN_INVOICE_STATUSES);

type SortKey = "number" | "customer" | "amount" | "dueDate" | "sentAt";

function isOverdue(row: InvoiceListRow): boolean {
  if (!OPEN_SET.has(row.status) || row.dueDate === null) return false;
  const due = new Date(row.dueDate);
  const endOfDueDay = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate() + 1
  );
  return Date.now() >= endOfDueDay.getTime();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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
  const { data, isLoading } = useInvoiceList({
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
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Invoices
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2 tabular-nums">
            {allCount} invoice{allCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search invoice #, customer…"
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
        <div className="hidden md:grid grid-cols-[80px_1fr_110px_110px_100px_105px_105px] bg-[var(--surface-2)] border-b border-[var(--line)]">
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
            sortKey="amount"
            label="Amount"
            sort={sort}
            onSort={handleSort}
            className="tabular-nums"
          />
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
            Balance due
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
            Status
          </div>
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
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : allCount === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No invoices yet.
          </div>
        ) : total === 0 ? (
          status === "open" && !query ? (
            <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              No open invoices — everything sent has been paid.
            </div>
          ) : (
            <EmptyState noun="invoice" query={query} />
          )
        ) : (
          <>
            {invoices.map((row) => {
              const pillColor =
                STATUS_PILL_COLOR[row.status] ?? "text-[var(--muted)]";
              const overdue = isOverdue(row);

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => router.push(`/invoices/${row.id}`)}
                  className="w-full text-left grid grid-cols-1 md:grid-cols-[80px_1fr_110px_110px_100px_105px_105px] items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]"
                >
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <span className="font-[var(--font-mono)] text-[13px] font-[600] tabular-nums">
                      #{row.invoiceNumber}
                    </span>
                  </div>
                  <div className={cn("px-3.5", rowPad)}>
                    <div className="text-[14px] font-[600] tracking-[-0.01em]">
                      {row.customerName ?? "—"}
                    </div>
                    <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap md:hidden">
                      #{row.invoiceNumber} ·{" "}
                      <span
                        className={overdue ? "text-[var(--accent)]" : undefined}
                        title={overdue ? "Overdue" : undefined}
                      >
                        {fmtDollar(row.balanceDue)} due
                      </span>{" "}
                      · <span className={pillColor}>{row.status}</span>
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="text-[13px] font-[600] tabular-nums">
                      {fmtDollar(row.amount)}
                    </div>
                  </div>
                  <div className={cn("px-3.5 hidden md:block", rowPad)}>
                    <div className="text-[13px] tabular-nums">
                      {fmtDollar(row.balanceDue)}
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
                      {row.status}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px]",
                      overdue ? "text-[var(--accent)]" : "text-[var(--muted)]",
                      rowPad
                    )}
                    title={overdue ? "Overdue" : undefined}
                  >
                    {fmtDate(row.dueDate)}
                  </div>
                  <div
                    className={cn(
                      "px-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]",
                      rowPad
                    )}
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
