"use client";

import { MagnifyingGlassIcon, XIcon } from "@/components/ui/icons";
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
      className={cn(
        "relative flex-1 min-w-[200px] md:max-w-[320px]",
        className
      )}
    >
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 size-[16px] text-[var(--muted)] pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? "Search"}
        className="field min-h-[38px] h-[38px] pl-9 pr-9 bg-[var(--surface)]"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2",
            "size-7 rounded-[var(--r-in)]",
            "text-[var(--muted)] cursor-pointer",
            "flex items-center justify-center",
            "hover:text-[var(--ink)] hover:bg-[var(--hover)]"
          )}
        >
          <XIcon aria-hidden="true" className="size-[14px]" />
        </button>
      )}
    </div>
  );
}
