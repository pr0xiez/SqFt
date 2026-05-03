import { cn } from "@/lib/cn";
import { sourceName } from "@/lib/utils";

const sourceStyles: Record<string, string> = {
  phone: "text-sage border-sage/40 bg-sage/7",
  online: "text-gold border-gold/40 bg-gold/7",
  referral: "text-vermil border-vermil/40 bg-vermil/7",
  walkin: "text-driftwood border-driftwood/40 bg-driftwood/7",
  website: "text-oak border-oak/30 bg-oak/5",
};

interface SourceBadgeProps {
  source: string;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5",
        "font-[var(--font-mono)] text-[10px] font-medium tracking-wider uppercase",
        sourceStyles[source] ?? "text-oak border-oak/30",
        className
      )}
    >
      {sourceName(source)}
    </span>
  );
}
