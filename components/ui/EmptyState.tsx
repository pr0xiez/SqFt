"use client";

type EmptyStateProps = {
  noun: string;
  query?: string;
};

export function EmptyState({ noun, query }: EmptyStateProps) {
  const trimmed = query?.trim() ?? "";
  return (
    <div className="px-6 py-10 flex flex-col items-start gap-2">
      <div className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.12em] text-[var(--muted)]">
        No results
      </div>
      <div className="text-[14px] text-[var(--ink-2)]">
        {trimmed.length > 0
          ? `No ${noun}s match "${trimmed}".`
          : `No ${noun}s match these filters.`}
      </div>
    </div>
  );
}
