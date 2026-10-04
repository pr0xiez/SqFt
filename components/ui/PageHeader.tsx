import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon, CaretRightIcon } from "@/components/ui/icons";
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

export interface Crumb {
  label: ReactNode;
  href: string;
}

/**
 * The record trail in a detail page's `kicker`: where this record sits in the
 * Customer → Site measure → Estimate → Invoice chain, nearest parent last
 * (the page title is the current record, so it isn't repeated). Phones,
 * where a long trail would wrap, show only the nearest parent as a back link.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  const parent = items[items.length - 1];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 max-w-full">
      <ol className="hidden sm:flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((crumb, i) => (
          <li
            key={crumb.href}
            className="inline-flex items-center gap-1.5 min-w-0"
          >
            {i > 0 && (
              <CaretRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-[var(--muted)] opacity-60"
              />
            )}
            <Link
              href={crumb.href}
              className="truncate max-w-[260px] text-[13.5px] font-[500] text-[var(--muted)] no-underline hover:text-[var(--ink)] transition-colors"
            >
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
      <BackLink href={parent.href} className="sm:hidden max-w-full">
        <span className="truncate">{parent.label}</span>
      </BackLink>
    </nav>
  );
}

/**
 * Crumbs for a record in the Customer → Site measure → Estimate chain: pass
 * the parents that exist above the current page, in any combination.
 */
export function recordTrail(parents: {
  customer?: { id: number; name: string } | null;
  siteMeasure?: { id: number; siteMeasureNumber?: number | null } | null;
  estimate?: { id: number; estimateNumber: number } | null;
}): Crumb[] {
  const { customer, siteMeasure, estimate } = parents;
  const crumbs: Crumb[] = [{ label: "Customers", href: "/customers" }];
  if (customer) {
    crumbs.push({ label: customer.name, href: `/customers/${customer.id}` });
  }
  if (siteMeasure) {
    crumbs.push({
      label: (
        <>
          Site measure{" "}
          <span className="type-figure">
            #{siteMeasure.siteMeasureNumber ?? siteMeasure.id}
          </span>
        </>
      ),
      href: `/site-measures/${siteMeasure.id}`,
    });
  }
  if (estimate) {
    crumbs.push({
      label: (
        <>
          Estimate{" "}
          <span className="type-figure">#{estimate.estimateNumber}</span>
        </>
      ),
      href: `/estimates/${estimate.id}`,
    });
  }
  return crumbs;
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
