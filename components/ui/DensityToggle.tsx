"use client";

import { ListIcon, RowsIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type Density = "comfortable" | "compact";

/** Row padding for tables, keyed by density. Use as `density === "compact" ? COMPACT_ROW : COMFORTABLE_ROW`. */
export const ROW_PADDING: Record<Density, string> = {
  comfortable: "py-3.5",
  compact: "py-2",
};

type DensityToggleProps = {
  value: Density;
  onChange: (value: Density) => void;
  className?: string;
};

export function DensityToggle({
  value,
  onChange,
  className,
}: DensityToggleProps) {
  return (
    <div className={cn("seg p-[2px] [&>*]:min-h-[28px] [&>*]:px-2", className)}>
      <button
        type="button"
        onClick={() => onChange("comfortable")}
        aria-label="Comfortable density"
        aria-pressed={value === "comfortable"}
        title="Comfortable density"
      >
        <RowsIcon aria-hidden="true" className="size-[16px]" />
      </button>
      <button
        type="button"
        onClick={() => onChange("compact")}
        aria-label="Compact density"
        aria-pressed={value === "compact"}
        title="Compact density"
      >
        <ListIcon aria-hidden="true" className="size-[16px]" />
      </button>
    </div>
  );
}
