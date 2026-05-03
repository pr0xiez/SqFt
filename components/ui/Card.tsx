import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  sub?: string;
}

export function Card({ className, title, sub, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--surface)] border border-[var(--line)] rounded-lg",
        "p-5",
        className
      )}
      {...props}
    >
      {(title || sub) && (
        <div className="flex items-baseline justify-between gap-2.5 mb-3.5">
          {title && (
            <strong className="font-[var(--font-display)] text-[14px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
              {title}
            </strong>
          )}
          {sub && (
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              {sub}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
