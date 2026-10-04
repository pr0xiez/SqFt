import { cn } from "@/lib/cn";

/**
 * The SqFt lockup, identical to the marketing site's: a true orange square
 * and the wordmark in Archivo at full width.
 */
export function BrandMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center select-none leading-none text-[var(--ink)]",
        size === "lg" ? "gap-3" : "gap-2.5",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 bg-[var(--accent)]",
          size === "lg"
            ? "size-[15px]"
            : size === "md"
              ? "size-[12px]"
              : "size-[10px]"
        )}
      />
      <span
        className={cn(
          "font-[820] [font-stretch:125%] tracking-[-0.03em]",
          size === "lg"
            ? "text-[24px]"
            : size === "md"
              ? "text-[19px]"
              : "text-[16px]"
        )}
      >
        SqFt
      </span>
    </span>
  );
}
