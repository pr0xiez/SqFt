import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * The top of every screen: the page title in the wide display face, an
 * optional meta line under it and the screen's actions on the right. Actions
 * wrap under the title on narrow screens.
 */
export function PageHeader({
  title,
  kicker,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  /** Small line above the title: a back link, a breadcrumb, a date. */
  kicker?: ReactNode;
  /** Line under the title: counts, address, status. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-6 md:mb-8",
        className
      )}
    >
      <div className="min-w-0 max-w-full">
        {kicker ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5 text-[13.5px] text-[var(--muted)]">
            {kicker}
          </div>
        ) : null}
        <h1 className="type-title break-words">{title}</h1>
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[14px] text-[var(--muted)]">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** "← Customers" style link back to a parent screen. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-[13.5px] font-[500] text-[var(--muted)] no-underline",
        "hover:text-[var(--ink)] transition-colors",
        className
      )}
    >
      <ArrowLeftIcon
        aria-hidden="true"
        className="size-[14px] transition-transform duration-300 ease-[var(--ease)] group-hover:-translate-x-0.5"
      />
      {children}
    </Link>
  );
}

/**
 * A thin separator for inline meta lines ("126 customers | 35 open"). Hidden
 * on phones, where the line wraps and a separator could dangle at a break.
 */
export function MetaSep() {
  return (
    <span
      aria-hidden="true"
      className="hidden sm:inline-block h-3 w-px bg-[var(--line-2)]"
    />
  );
}
