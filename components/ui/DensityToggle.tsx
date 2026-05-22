"use client";

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
    <div
      className={cn(
        "inline-flex items-center gap-px rounded-[5px]",
        "border border-[var(--line)] bg-[var(--surface)] overflow-hidden",
        className
      )}
    >
      <DensityButton
        active={value === "comfortable"}
        onClick={() => onChange("comfortable")}
        label="Comfortable density"
      >
        <RowsIcon density="comfortable" />
      </DensityButton>
      <DensityButton
        active={value === "compact"}
        onClick={() => onChange("compact")}
        label="Compact density"
      >
        <RowsIcon density="compact" />
      </DensityButton>
    </div>
  );
}

function DensityButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "px-2 py-[6px] cursor-pointer transition-colors duration-150",
        "flex items-center justify-center",
        active
          ? "bg-[var(--ink)] text-[var(--bg)]"
          : "bg-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
      )}
    >
      {children}
    </button>
  );
}

function RowsIcon({ density }: { density: Density }) {
  const gap = density === "compact" ? 3 : 4.5;
  return (
    <svg
      viewBox="0 0 14 12"
      width={14}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1={1} y1={6 - gap} x2={13} y2={6 - gap} />
      <line x1={1} y1={6} x2={13} y2={6} />
      <line x1={1} y1={6 + gap} x2={13} y2={6 + gap} />
    </svg>
  );
}
