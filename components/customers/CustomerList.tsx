"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { filterCustomers } from "@/components/customers/filterCustomers";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cn } from "@/lib/cn";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { sourceName } from "@/lib/utils";

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

export function CustomerListView() {
  const router = useRouter();
  const { data: customers = [], isLoading } = useCustomers();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(false);

  const filtered = filterCustomers(customers, query, filter);

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Customers
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {customers.length} customers
          </div>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)}>
          + New Customer
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, phone, email, address…"
        />
        {SOURCES.map((src) => (
          <button
            key={src}
            type="button"
            onClick={() => setFilter(src)}
            className={cn(
              "font-[var(--font-mono)] text-[11px] px-3 py-1.5 border rounded-[6px] cursor-pointer transition-colors duration-150",
              filter === src
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
            )}
          >
            {src === "all" ? "All" : sourceName(src)}
          </button>
        ))}
        {filtered.length !== customers.length && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] ml-auto">
            {filtered.length} shown
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[1fr_130px_100px_90px_100px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Customer
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Source
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Estimates
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Added
          </div>
          <div className="px-3.5 py-2.5" />
        </div>

        {isLoading ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {query.trim().length > 0
              ? `No customers match "${query.trim()}".`
              : "No customers found."}
          </div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/customers/${c.id}`)}
              className={cn(
                "w-full text-left grid grid-cols-1 md:grid-cols-[1fr_130px_100px_90px_100px]",
                "items-center border-b border-[var(--line)] last:border-b-0",
                "cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]",
                "border-l-[3px]",
                SOURCE_ROW_BORDERS[c.source] ?? "border-l-transparent"
              )}
            >
              <div className="px-3.5 py-3.5">
                <div className="text-[14px] font-[600] tracking-[-0.01em] mb-0.5">
                  {c.name}
                </div>
                <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                  {c.phone}
                  {c.email ? ` · ${c.email}` : ""}
                </div>
              </div>
              <div className="px-3.5 py-3.5 hidden md:block">
                <SourceBadge source={c.source} />
              </div>
              <div className="px-3.5 py-3.5 hidden md:block text-[16px] font-[600]">
                {c._count?.estimates ?? 0}
              </div>
              <div className="px-3.5 py-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                {new Date(c.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="px-3.5 py-3.5 hidden md:block">
                <span className="inline-block whitespace-nowrap font-[var(--font-mono)] text-[10px] px-3 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[5px] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors duration-150">
                  Open →
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      <NewCustomerPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
