import { cn } from "@/lib/cn";
import { sourceName } from "@/lib/utils";

/**
 * Lead source tag. Sources are categories, not states, so they stay neutral:
 * the label carries the meaning, not a colour.
 */
export function SourceBadge({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[22px] px-[7px] rounded-[var(--r)]",
        "text-[12.5px] font-[560] leading-none whitespace-nowrap",
        "text-[var(--ink-2)] bg-[var(--surface-2)]",
        className
      )}
    >
      {sourceName(source)}
    </span>
  );
}
