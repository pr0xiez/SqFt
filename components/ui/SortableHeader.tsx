"use client";

import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { SortState } from "@/lib/sort";

type SortableHeaderProps<K extends string> = {
  sortKey: K;
  label: string;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  /** Right-align the label and indicator (numeric columns). */
  align?: "left" | "right";
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

  const Glyph =
    direction === "asc"
      ? CaretUpIcon
      : direction === "desc"
        ? CaretDownIcon
        : CaretUpDownIcon;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}, ${stateSuffix}`}
      className={cn(
        "group w-full h-full px-3.5 py-2.5",
        "text-[13px] font-[500] text-left whitespace-nowrap",
        "transition-colors duration-150 cursor-pointer",
        "flex items-center gap-1",
        align === "right" && "justify-end",
        active
          ? "text-[var(--ink)]"
          : "text-[var(--muted)] hover:text-[var(--ink)]",
        className
      )}
    >
      <span>{label}</span>
      <Glyph
        aria-hidden="true"
        weight={active ? "bold" : "regular"}
        className={cn(
          "size-[12px] shrink-0 transition-opacity",
          active ? "opacity-100" : "opacity-40 group-hover:opacity-80"
        )}
      />
    </button>
  );
}
