"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { filterCustomers } from "@/components/customers/filterCustomers";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cn } from "@/lib/cn";
import {
  type Customer,
  type CustomerListQuoteSummary,
  useCustomers,
} from "@/lib/hooks/useCustomers";
import { isOpenQuote, lastTouchAt, relativeTime } from "@/lib/quoteStatus";
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

const PIPELINE_FILTERS = [
  { id: "any", label: "Any pipeline" },
  { id: "open", label: "Open quote" },
  { id: "accepted", label: "Won" },
  { id: "cold", label: "No activity" },
] as const;

type PipelineFilter = (typeof PIPELINE_FILTERS)[number]["id"];

interface CustomerSummary {
  open: number;
  accepted: number;
  total: number;
  lastActivity: string | null;
}

function summarize(customer: Customer): CustomerSummary {
  const ests = (customer.estimates ?? []) as Array<{
    quotes?: CustomerListQuoteSummary[];
  }>;
  const quotes: CustomerListQuoteSummary[] = ests.flatMap(
    (e) => e.quotes ?? []
  );
  const open = quotes.filter(isOpenQuote).length;
  const accepted = quotes.filter((q) => q.status === "accepted").length;
  const last =
    quotes.length > 0
      ? quotes.map(lastTouchAt).sort().reverse()[0]
      : (customer.createdAt ?? null);
  return { open, accepted, total: quotes.length, lastActivity: last };
}

export function CustomerListView() {
  const router = useRouter();
  const { data: customers = [], isLoading } = useCustomers();
  const [filter, setFilter] = useState<string>("all");
  const [pipeline, setPipeline] = useState<PipelineFilter>("any");
  const [query, setQuery] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(false);

  const summarized = useMemo(
    () =>
      customers.map((c) => ({
        customer: c,
        summary: summarize(c),
      })),
    [customers]
  );

  const totals = useMemo(() => {
    let openQuotes = 0;
    let won = 0;
    let withOpen = 0;
    for (const { summary } of summarized) {
      openQuotes += summary.open;
      won += summary.accepted;
      if (summary.open > 0) withOpen += 1;
    }
    return { openQuotes, won, withOpen };
  }, [summarized]);

  const filtered = useMemo(() => {
    const base = filterCustomers(
      summarized.map((s) => s.customer),
      query,
      filter
    );
    const baseIds = new Set(base.map((c) => c.id));
    return summarized.filter(({ customer, summary }) => {
      if (!baseIds.has(customer.id)) return false;
      if (pipeline === "open") return summary.open > 0;
      if (pipeline === "accepted") return summary.accepted > 0;
      if (pipeline === "cold") return summary.total === 0;
      return true;
    });
  }, [summarized, query, filter, pipeline]);

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-6 gap-5">
        <div>
          <h1 className="text-[40px] font-[700] leading-[1.02] tracking-[-0.03em]">
            Customers
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-2.5 uppercase tracking-[.08em]">
            <span>
              <span className="text-[var(--ink)] font-[600]">
                {customers.length}
              </span>{" "}
              total
            </span>
            <span className="w-px h-3 bg-[var(--line-2)]" />
            <span>
              <span
                className={cn(
                  "font-[600]",
                  totals.openQuotes > 0
                    ? "text-[var(--gold)]"
                    : "text-[var(--muted)]"
                )}
              >
                {totals.openQuotes}
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

      {/* Filter bar */}
      <div className="flex flex-col gap-2.5 mb-4">
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-[var(--font-mono)] text-[9.5px] text-[var(--muted)] uppercase tracking-[.1em] mr-1">
            Pipeline
          </span>
          {PIPELINE_FILTERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPipeline(p.id)}
              className={cn(
                "font-[var(--font-mono)] text-[10.5px] px-2.5 py-1 border rounded-[5px] cursor-pointer transition-colors duration-150 uppercase tracking-[.06em]",
                pipeline === p.id
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                  : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
              )}
            >
              {p.label}
            </button>
          ))}
          {filtered.length !== customers.length && (
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] ml-auto">
              {filtered.length} shown
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[1fr_120px_70px_70px_120px_90px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Customer
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Source
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] text-right tabular-nums">
            Est.
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] text-right tabular-nums">
            Open
          </div>
          <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Last activity
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
              : "No customers match these filters."}
          </div>
        ) : (
          filtered.map(({ customer: c, summary }) => {
            const estCount = c._count?.estimates ?? 0;
            const won = summary.accepted > 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/customers/${c.id}`)}
                className={cn(
                  "w-full text-left grid grid-cols-1 md:grid-cols-[1fr_120px_70px_70px_120px_90px]",
                  "items-center border-b border-[var(--line)] last:border-b-0",
                  "cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-2)]",
                  "border-l-[3px]",
                  SOURCE_ROW_BORDERS[c.source] ?? "border-l-transparent"
                )}
              >
                <div className="px-3.5 py-3.5 min-w-0">
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
                <div className="px-3.5 py-3.5 hidden md:block">
                  <SourceBadge source={c.source} />
                </div>
                <div className="px-3.5 py-3.5 hidden md:block text-right text-[15px] font-[600] tabular-nums">
                  {estCount}
                </div>
                <div
                  className="px-3.5 py-3.5 hidden md:block text-right text-[15px] font-[700] tabular-nums"
                  style={{
                    color: summary.open > 0 ? "var(--gold)" : "var(--muted)",
                  }}
                >
                  {summary.open || "—"}
                </div>
                <div className="px-3.5 py-3.5 hidden md:block min-w-0">
                  <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink-2)] truncate">
                    {summary.lastActivity
                      ? relativeTime(summary.lastActivity)
                      : "—"}
                  </div>
                  {summary.total > 0 && (
                    <div className="font-[var(--font-mono)] text-[9.5px] text-[var(--muted)] uppercase tracking-[.08em] mt-0.5">
                      {summary.total} quote{summary.total === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div className="px-3.5 py-3.5 hidden md:block">
                  <span className="inline-block whitespace-nowrap font-[var(--font-mono)] text-[10px] px-3 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[5px] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors duration-150">
                    Open →
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <NewCustomerPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
