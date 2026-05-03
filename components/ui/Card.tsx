import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  cornerDecoration?: boolean;
}

export function Card({
  className,
  title,
  cornerDecoration = true,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "relative bg-cream border-[1.5px] border-oak",
        "shadow-[3px_3px_0_var(--manila)]",
        "p-[18px_20px]",
        cornerDecoration && "card-corner",
        className
      )}
      {...props}
    >
      {title && (
        <div className="flex items-baseline gap-2 mb-3">
          <strong className="font-[var(--font-display)] text-sm font-bold text-oak tracking-tight">
            {title}
          </strong>
        </div>
      )}
      {children}
    </div>
  );
}
