import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A labelled figure: KPI tiles, totals, summary strips. The value is set in
 * mono, like the totals on the marketing site's estimate panel.
 */
export function Stat({
  label,
  value,
  sub,
  size = "md",
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: "sm" | "md" | "lg";
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="type-label">{label}</div>
      <div
        className={cn(
          "type-stat mt-1.5",
          size === "lg"
            ? "text-[clamp(1.75rem,1.3rem+1.4vw,2.4rem)]"
            : size === "md"
              ? "text-[28px]"
              : "text-[19px]",
          valueClassName
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1.5 text-[13px] text-[var(--muted)]">{sub}</div>
      ) : null}
    </div>
  );
}
