"use client";

import { useMemo } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { PER_PAGE_OPTIONS } from "@/lib/pagination/constants";

type PaginationProps = {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: readonly number[];
  /** Singular noun for the range readout (default: "row"). */
  noun?: string;
  className?: string;
};

export { PER_PAGE_OPTIONS };

export function Pagination({
  total,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = PER_PAGE_OPTIONS,
  noun = "row",
  className,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const startIdx = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const endIdx = Math.min(safePage * perPage, total);

  if (total === 0) return null;

  return (
    <div
      className={cn(
        "border-t border-[var(--line)]",
        "px-4 py-3 grid gap-x-5 gap-y-3",
        "grid-cols-1 md:grid-cols-[auto_1fr_auto]",
        "items-center",
        className
      )}
    >
      {/* LEFT: rows per page */}
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] font-[500] text-[var(--muted)]">Rows</span>
        <div className="seg p-[2px] [&>*]:min-h-[26px] [&>*]:px-2.5">
          {perPageOptions.map((n) => {
            const active = n === perPage;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (!onPerPageChange || active) return;
                  onPerPageChange(n);
                }}
                disabled={!onPerPageChange}
                aria-pressed={active}
                className="type-figure text-[12.5px] disabled:cursor-not-allowed"
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* CENTER: tape-measure ruler */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center justify-between gap-3 text-[13px] text-[var(--muted)]">
          <span>
            <span className="type-figure text-[var(--ink)] font-[600]">
              {startIdx.toLocaleString()}-{endIdx.toLocaleString()}
            </span>{" "}
            of <span className="type-figure">{total.toLocaleString()}</span>{" "}
            {noun}
            {total === 1 ? "" : "s"}
          </span>
          <span className="hidden sm:inline">
            {pageCount} {pageCount === 1 ? "page" : "pages"}
          </span>
        </div>
        <TapeMeasure
          page={safePage}
          pageCount={pageCount}
          onPageChange={onPageChange}
          startIdx={startIdx}
          endIdx={endIdx}
          perPage={perPage}
          total={total}
          noun={noun}
        />
      </div>

      {/* RIGHT: prev / page / next */}
      <div className="flex items-center gap-2 justify-self-end">
        <NavButton
          direction="prev"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        />
        <div className="type-figure text-[13px] text-[var(--ink)] min-w-[64px] text-center">
          <span className="font-[600]">{safePage}</span>
          <span className="text-[var(--muted)] mx-1">/</span>
          <span className="text-[var(--muted)]">{pageCount}</span>
        </div>
        <NavButton
          direction="next"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(safePage + 1)}
        />
      </div>
    </div>
  );
}

/* ── TAPE-MEASURE RULER ─────────────────────────────────────────────────── */

type TapeMeasureProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  startIdx: number;
  endIdx: number;
  total: number;
  perPage: number;
  noun: string;
};

const TICK_STEPS: readonly (readonly [number, number])[] = [
  [30, 1],
  [60, 2],
  [120, 5],
];

/**
 * Decide which page indices get a tick on the tape measure. Always
 * includes page 1, the last page, and the current page; in between,
 * thins ticks out as the total page count grows so the rule stays
 * legible.
 *
 * Exported for unit testing.
 */
export function computeTicks(page: number, pageCount: number): number[] {
  const step = TICK_STEPS.find(([cap]) => pageCount <= cap)?.[1] ?? 10;
  const list: number[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || i === page || i % step === 0) {
      list.push(i);
    }
  }
  return list;
}

function TapeMeasure({
  page,
  pageCount,
  onPageChange,
  total,
  perPage,
  noun,
}: TapeMeasureProps) {
  const ticks = useMemo(() => computeTicks(page, pageCount), [page, pageCount]);

  if (pageCount <= 1) {
    return (
      <div className="h-[18px] flex items-center">
        <div className="h-px w-full bg-[var(--line-2)]" />
      </div>
    );
  }

  return (
    <div className="relative h-[18px] select-none">
      {/* baseline rule */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-[var(--line-2)]" />

      {/* progress fill from start to current page */}
      <div
        className="absolute left-0 top-1/2 h-[2px] -mt-px bg-[var(--accent)] transition-[width] duration-300 ease-[var(--ease)]"
        style={{
          width: `${((page - 1) / Math.max(1, pageCount - 1)) * 100}%`,
        }}
      />

      {/* ticks */}
      {ticks.map((p) => {
        const isCurrent = p === page;
        const isMajor = p === 1 || p === pageCount;
        const pct = ((p - 1) / Math.max(1, pageCount - 1)) * 100;
        const rangeStart = (p - 1) * perPage + 1;
        const rangeEnd = Math.min(p * perPage, total);
        return (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-label={`Page ${p} (${noun}s ${rangeStart}-${rangeEnd})`}
            aria-current={isCurrent ? "page" : undefined}
            title={`Page ${p}: ${noun}s ${rangeStart.toLocaleString()}-${rangeEnd.toLocaleString()}`}
            className={cn(
              "absolute top-0 bottom-0 -translate-x-1/2",
              "w-[14px] flex items-center justify-center",
              "cursor-pointer group"
            )}
            style={{ left: `${pct}%` }}
          >
            <span
              className={cn(
                "block w-px transition-all duration-150",
                isCurrent
                  ? "h-[16px] w-[2px] bg-[var(--accent)]"
                  : isMajor
                    ? "h-[10px] bg-[var(--ink-2)] group-hover:bg-[var(--ink)]"
                    : "h-[6px] bg-[var(--line-2)] group-hover:bg-[var(--ink-2)]"
              )}
            />
            {isCurrent && (
              <span
                aria-hidden="true"
                className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-[7px] h-[7px] bg-[var(--accent)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── PREV / NEXT BUTTONS ─────────────────────────────────────────────────── */

function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Previous page" : "Next page"}
      className={cn(
        "inline-flex items-center justify-center",
        "size-[34px] rounded-[var(--r)]",
        "border border-[color-mix(in_oklab,var(--ink)_28%,transparent)] bg-transparent",
        "text-[var(--ink)] cursor-pointer",
        "transition-[background-color,border-color,transform] duration-200 ease-[var(--ease)]",
        "hover:border-[var(--ink)] hover:bg-[var(--hover)] active:scale-[0.96]",
        "disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:scale-100"
      )}
    >
      {direction === "prev" ? (
        <CaretLeftIcon aria-hidden="true" className="size-[15px]" />
      ) : (
        <CaretRightIcon aria-hidden="true" className="size-[15px]" />
      )}
    </button>
  );
}
