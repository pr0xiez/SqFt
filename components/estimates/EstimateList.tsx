"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type EstimateStatus,
  filterEstimates,
} from "@/components/estimates/filterEstimates";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { useEstimates } from "@/lib/hooks/useEstimates";
import { estTotalArea } from "@/lib/utils";

const STATUS_FILTERS: { value: EstimateStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "empty", label: "No rooms" },
  { value: "measured", label: "Measured" },
  { value: "quoted", label: "Quoted" },
];

export function EstimateListView() {
  const router = useRouter();
  const { data: estimates = [], isLoading } = useEstimates();
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<EstimateStatus>("all");

  const filtered = filterEstimates(estimates, query, status);
  const isNarrowed = filtered.length !== estimates.length;
  const trimmedQuery = query.trim();

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            Estimates
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {estimates.length} estimates
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
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={cn(
              "font-[var(--font-mono)] text-[11px] px-3 py-1.5 border rounded-[6px] cursor-pointer transition-colors duration-150",
              status === value
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]",
            )}
          >
            {label}
          </button>
        ))}
        {isNarrowed && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] ml-auto">
            {filtered.length} shown
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[80px_1fr_130px_110px_80px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            #
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Customer
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Area
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Date
          </div>
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
          <div className="p-6 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {trimmedQuery.length > 0
              ? `No estimates match "${trimmedQuery}".`
              : "No estimates match."}
          </div>
        ) : (
          filtered.map((est) => {
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
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span className="font-[var(--font-mono)] text-[13px] font-[600]">
                    #{est.id}
                  </span>
                </div>
                <div className="px-3.5 py-3.5">
                  <div className="text-[14px] font-[600] tracking-[-0.01em]">
                    {est.title || est.customer?.name || "—"}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate overflow-hidden text-ellipsis whitespace-nowrap">
                    {est.title
                      ? (est.customer?.name ?? "")
                      : (est.customer?.address ?? "")}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <div className="text-[13px] font-[600]">
                    {area > 0 ? `${Math.round(area)} sqft` : "—"}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-px">
                    {roomCount} room{roomCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 hidden md:block font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                  {new Date(est.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span className="font-[var(--font-mono)] text-[10px] px-3 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[5px]">
                    Open →
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
