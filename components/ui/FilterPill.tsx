"use client";

import { cn } from "@/lib/cn";

type FilterPillProps = {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
};

/** A filter chip with an optional count. Active chips fill with ink. */
export function FilterPill({
  active,
  count,
  onClick,
  children,
  size = "md",
}: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap",
        "border rounded-[var(--r)] cursor-pointer font-[560]",
        "transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease)] active:scale-[0.97]",
        size === "md"
          ? "h-[34px] px-3 text-[13.5px]"
          : "h-[30px] px-2.5 text-[13px]",
        active
          ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
          : "bg-transparent text-[var(--ink-2)] border-[var(--line-2)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
      )}
    >
      <span>{children}</span>
      {count > 0 && (
        <span
          className={cn(
            "type-figure leading-none text-[12px]",
            active ? "text-[var(--bg)] opacity-70" : "text-[var(--muted)]"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
