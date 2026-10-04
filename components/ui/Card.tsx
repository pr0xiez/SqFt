import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  sub?: ReactNode;
  /** Right side of the header row: a link, a button, a count. */
  action?: ReactNode;
  /** Drop the body padding (tables and lists that run edge to edge). */
  flush?: boolean;
}

/**
 * Flat panel on the page background. Cards never cast shadows; elevation is
 * reserved for things that float (menus, dialogs, toasts).
 */
export function Card({
  className,
  title,
  sub,
  action,
  flush = false,
  children,
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || sub || action);
  return (
    <section
      className={cn("card", !flush && "p-5 md:p-6", className)}
      {...props}
    >
      {hasHeader && (
        <div
          className={cn(
            "flex items-start justify-between gap-3",
            flush ? "px-5 md:px-6 pt-5 pb-4" : "mb-4"
          )}
        >
          <div className="min-w-0">
            {title && <h2 className="type-heading">{title}</h2>}
            {sub && (
              <p className="mt-1 text-[13px] text-[var(--muted)]">{sub}</p>
            )}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
