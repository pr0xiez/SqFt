"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cn } from "@/lib/cn";
import { useCustomers } from "@/lib/hooks/useCustomers";

const SOURCES = [
  "all",
  "phone",
  "online",
  "referral",
  "walkin",
  "website",
] as const;

export function CustomerListView() {
  const router = useRouter();
  const { data: customers = [], isLoading } = useCustomers();

  const [filter, setFilter] = useState<string>("all");
  const [panelOpen, setPanelOpen] = useState(false);

  const filtered =
    filter === "all" ? customers : customers.filter((c) => c.source === filter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between pb-4 border-b border-[var(--line)]">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] font-[500] text-[var(--muted)] tracking-[.04em] mb-1.5">
            All clients
          </div>
          <h1 className="font-[var(--font-display)] text-[36px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
            Customers
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] font-[500] text-[var(--muted)] tracking-[.04em] mt-1">
            {customers.length} customers
          </div>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)}>
          + New customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((src) => (
          <button
            key={src}
            type="button"
            onClick={() => setFilter(src)}
            className={cn(
              "min-h-[36px] px-4 font-[var(--font-mono)] text-[11px] font-[500] tracking-[.02em]",
              "border rounded-[6px] transition-[background,border-color,color] duration-[150ms]",
              filter === src
                ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)]"
                : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
            )}
          >
            {src === "all" ? "All" : src}
          </button>
        ))}
      </div>

      {/* Table header — desktop only */}
      <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-3 px-4 py-2 bg-[var(--surface-2)] border-b border-[var(--line)] font-[var(--font-mono)] text-[10px] font-[500] uppercase tracking-[.06em] text-[var(--muted)]">
        <span>Name</span>
        <span>Phone</span>
        <span>Source</span>
        <span>Added</span>
        <span className="text-right">Estimates</span>
      </div>

      {/* Rows */}
      {isLoading ? (
        <p className="font-[var(--font-mono)] text-[11px] font-[500] text-[var(--muted)] tracking-[.04em] py-4">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] font-[500] text-[var(--muted)] tracking-[.04em] py-4">
          No customers yet. Add your first one →
        </p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/customers/${c.id}`)}
              className="w-full text-left grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_80px] gap-x-3 gap-y-0 px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              <div>
                <span className="font-[var(--font-display)] text-[14px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
                  {c.name}
                </span>
                {c.address && (
                  <span className="block font-[var(--font-mono)] text-[11px] font-[500] text-[var(--muted)] tracking-[.04em] truncate mt-0.5">
                    {c.address}
                  </span>
                )}
                <div className="flex items-center gap-3 mt-1.5 md:hidden">
                  <SourceBadge source={c.source} />
                  <span className="font-[var(--font-mono)] text-[10px] font-[500] text-[var(--muted)] tracking-[.04em]">
                    {c._count?.estimates ?? 0} estimate
                    {(c._count?.estimates ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <span className="font-[var(--font-mono)] text-[12px] font-[500] text-[var(--ink-2)] tracking-[.04em] hidden md:block self-center">
                {c.phone ?? "—"}
              </span>
              <span className="hidden md:flex items-center">
                <SourceBadge source={c.source} />
              </span>
              <span className="font-[var(--font-mono)] text-[12px] font-[500] text-[var(--muted)] tracking-[.04em] hidden md:block self-center">
                {new Date(c.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                })}
              </span>
              <span className="font-[var(--font-mono)] text-[12px] font-[500] text-right text-[var(--ink-2)] tracking-[.04em] hidden md:block self-center">
                {c._count?.estimates ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      <NewCustomerPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
