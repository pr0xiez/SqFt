"use client";

import { cn } from "@/lib/cn";

type FilterPillProps = {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
};

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
      className={cn(
        "font-[var(--font-mono)] border rounded-[6px] cursor-pointer transition-colors duration-150",
        "inline-flex items-center gap-1.5",
        size === "md"
          ? "text-[11px] px-3 py-1.5"
          : "text-[10.5px] px-2.5 py-1 uppercase tracking-[.06em] rounded-[5px]",
        active
          ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
          : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
      )}
    >
      <span>{children}</span>
      {count > 0 && (
        <span
          className={cn(
            "font-[var(--font-mono)] tabular-nums leading-none",
            size === "md" ? "text-[9.5px]" : "text-[9px]",
            active ? "text-[var(--bg)]/70" : "text-[var(--muted)]"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
