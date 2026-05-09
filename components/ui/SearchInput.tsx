"use client";

import { cn } from "@/lib/cn";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: SearchInputProps) {
  return (
    <div
      className={cn("relative flex-1 min-w-[200px] max-w-[320px]", className)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[13px] h-[13px] text-[var(--muted)] pointer-events-none"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full font-[var(--font-mono)] text-[12px]",
          "py-[7px] pr-7 pl-[30px]",
          "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]",
          "rounded-[6px] tracking-[.01em]",
          "transition-colors duration-150",
          "placeholder:text-[var(--muted)]",
          "focus:outline-none focus:border-[var(--ink-2)]"
        )}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2",
            "w-[18px] h-[18px] rounded-full",
            "border-none bg-[var(--surface-2)] text-[var(--muted)]",
            "text-[11px] leading-none cursor-pointer",
            "flex items-center justify-center",
            "hover:text-[var(--ink)] hover:bg-[var(--line)]"
          )}
        >
          ×
        </button>
      )}
    </div>
  );
}
