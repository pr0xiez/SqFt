import type { ReactNode } from "react";
import {
  type Icon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  /** Record noun for the default "no results" copy ("estimate"). */
  noun?: string;
  /** Active search query, quoted in the default copy. */
  query?: string;
  /** Custom headline; replaces the default no-results copy. */
  title?: ReactNode;
  /** Supporting line under the headline. */
  body?: ReactNode;
  /** What to do next: usually one button. */
  action?: ReactNode;
  icon?: Icon;
  className?: string;
};

/**
 * Empty and no-results states. With only `noun`/`query` it renders the
 * filtered-list "no results" message; pass `title`/`body`/`action` for a
 * first-run state that tells the user how to fill the list.
 */
export function EmptyState({
  noun,
  query,
  title,
  body,
  action,
  icon: StateIcon = MagnifyingGlassIcon,
  className,
}: EmptyStateProps) {
  const trimmed = query?.trim() ?? "";
  const headline =
    title ??
    (trimmed.length > 0
      ? `No ${noun ?? "item"}s match "${trimmed}".`
      : `No ${noun ?? "item"}s match these filters.`);
  return (
    <div
      className={cn(
        "px-6 py-12 flex flex-col items-center text-center gap-3",
        className
      )}
    >
      <span className="flex items-center justify-center size-10 rounded-[var(--r)] bg-[var(--surface-2)] text-[var(--muted)]">
        <StateIcon aria-hidden="true" className="size-5" />
      </span>
      <div className="max-w-[44ch]">
        <p className="text-[15px] font-[600] text-[var(--ink)]">{headline}</p>
        {body ? (
          <p className="mt-1 text-[14px] text-[var(--muted)]">{body}</p>
        ) : !title ? (
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Try a different search or clear the filters.
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Skeleton rows shown while a list loads. Keeps the visible "Loading…" text
 * for screen readers (and the e2e suite, which waits for it to detach).
 */
export function LoadingRows({
  rows = 6,
  label = "Loading…",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3", className)} aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={i}
            className="flex items-center gap-4 py-1.5"
            style={{ opacity: 1 - i * (0.7 / rows) }}
          >
            <span className="h-3 w-14 rounded-[var(--r-in)] bg-[var(--surface-2)] animate-pulse" />
            <span className="h-3 flex-1 max-w-[260px] rounded-[var(--r-in)] bg-[var(--surface-2)] animate-pulse" />
            <span className="h-3 w-20 ml-auto rounded-[var(--r-in)] bg-[var(--surface-2)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Inline loading line for small regions (a card body, a panel). */
export function LoadingLine({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 py-2 text-[14px] text-[var(--muted)]",
        className
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className="size-3.5 rounded-full border-2 border-[var(--line-2)] border-t-[var(--accent)] animate-spin"
      />
      {label}
    </div>
  );
}

/** A load failure with a way out. */
export function ErrorState({
  message,
  action,
  className,
}: {
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("px-6 py-10 flex flex-col items-start gap-3", className)}
      role="alert"
    >
      <p className="flex items-center gap-2 text-[14.5px] font-[560] text-[var(--accent-ink)]">
        <WarningCircleIcon aria-hidden="true" className="size-[18px]" />
        {message}
      </p>
      {action}
    </div>
  );
}
