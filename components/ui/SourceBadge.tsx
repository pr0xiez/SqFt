import { cn } from "@/lib/cn";
import { sourceName } from "@/lib/utils";

const sourceStyles: Record<string, string> = {
  phone: "text-[var(--sage)]   border-[var(--sage)]/40   bg-[var(--sage)]/7",
  online: "text-[var(--gold)]   border-[var(--gold)]/40   bg-[var(--gold)]/7",
  referral:
    "text-[var(--accent)] border-[var(--accent)]/40 bg-[var(--accent)]/7",
  walkin: "text-[var(--muted)]  border-[var(--muted)]/40  bg-[var(--muted)]/7",
  website: "text-[var(--ink-2)]  border-[var(--ink-2)]/30  bg-[var(--ink-2)]/5",
};

interface SourceBadgeProps {
  source: string;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 rounded-[4px]",
        "font-[var(--font-mono)] text-[9px] font-[500] tracking-[.04em] uppercase",
        sourceStyles[source] ?? "text-[var(--muted)] border-[var(--line)]",
        className
      )}
    >
      {sourceName(source)}
    </span>
  );
}
