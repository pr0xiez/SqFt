import { cn } from "@/lib/cn";

/**
 * Progress shown as the marketing site's tape-measure blade: the orange blade
 * pulls out to the value, with its hook at the start. Fixed tick spacing, like
 * a real tape: the blade grows, the markings don't stretch.
 *
 * `marker` drops a lead line at a second point (a pace or a target).
 */
export function TapeMeter({
  value,
  marker,
  markerLabel,
  label,
  size = "md",
  className,
}: {
  /** Progress, 0 to 1. Clamped. */
  value: number;
  /** Optional second point, 0 to 1 (e.g. where you should be by today). */
  marker?: number;
  /** Text above the marker line. */
  markerLabel?: string;
  /** Accessible name, e.g. "Booked revenue toward goal". */
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  const markerPct =
    marker === undefined
      ? null
      : Math.round(Math.min(1, Math.max(0, marker)) * 1000) / 10;

  return (
    <div
      className={cn(
        "relative",
        size === "md" ? "h-[16px]" : "h-[10px]",
        markerLabel ? "mt-6" : null,
        className
      )}
    >
      {/* native meter for assistive tech; the tape below is decoration */}
      <meter
        className="sr-only"
        min={0}
        max={100}
        value={pct}
        aria-label={label}
      >
        {pct}%
      </meter>

      {/* the floor: where the blade will reach */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--line-2)]" />
      <div className="absolute right-0 top-[15%] bottom-[15%] w-px bg-[var(--line-2)]" />

      {pct > 0 && (
        <div
          className="tape-blade absolute left-0 top-0 bottom-0 animate-[tape-pull_1.1s_var(--ease)_both]"
          style={{ width: `${pct}%` }}
        />
      )}

      {/* the hook on the end of the blade */}
      <span
        aria-hidden="true"
        className="absolute -left-[3px] -top-[3px] -bottom-[3px] w-[5px] rounded-[1px] bg-[var(--ink-2)]"
      />

      {markerPct !== null && (
        <div
          className="absolute -top-[5px] -bottom-[5px] w-[2px] -ml-px bg-[var(--ink)]"
          style={{ left: `${markerPct}%` }}
        >
          {markerLabel ? (
            <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-[600] text-[var(--ink-2)]">
              {markerLabel}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
