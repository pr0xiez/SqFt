"use client";

import { cn } from "@/lib/cn";
import type { SortDirection, SortState } from "@/lib/sort";

type SortableHeaderProps<K extends string> = {
  sortKey: K;
  label: string;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  /** Right-align the label and indicator (numeric columns). */
  align?: "left" | "right";
  /** Default sort direction the first time this column is clicked. */
  defaultDirection?: SortDirection;
  className?: string;
};

export function SortableHeader<K extends string>({
  sortKey,
  label,
  sort,
  onSort,
  align = "left",
  className,
}: SortableHeaderProps<K>) {
  const active = sort?.key === sortKey;
  const direction = active ? sort?.direction : null;

  const stateSuffix = !active
    ? "not sorted"
    : direction === "asc"
      ? "sorted ascending"
      : "sorted descending";

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}, ${stateSuffix}`}
      className={cn(
        "w-full h-full px-3.5 py-2.5",
        "font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em]",
        "transition-colors duration-150 cursor-pointer",
        "flex items-center gap-1.5",
        align === "right" && "justify-end",
        active
          ? "text-[var(--ink)]"
          : "text-[var(--muted)] hover:text-[var(--ink-2)]",
        className
      )}
    >
      <span>{label}</span>
      <SortGlyph direction={direction} />
    </button>
  );
}

function SortGlyph({ direction }: { direction: SortDirection | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex flex-col items-center justify-center",
        "w-[8px] leading-none transition-opacity duration-150",
        direction ? "opacity-100" : "opacity-30"
      )}
    >
      <svg
        viewBox="0 0 8 4"
        className={cn(
          "w-[8px] h-[4px]",
          direction === "asc" ? "text-[var(--ink)]" : "text-[var(--muted)]"
        )}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M4 0L8 4H0z" />
      </svg>
      <span className="block h-[1px]" />
      <svg
        viewBox="0 0 8 4"
        className={cn(
          "w-[8px] h-[4px]",
          direction === "desc" ? "text-[var(--ink)]" : "text-[var(--muted)]"
        )}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M0 0L8 0L4 4z" />
      </svg>
    </span>
  );
}
