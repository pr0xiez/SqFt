import { roundToDecimals } from "@/lib/money";

/**
 * Decimal-rate <-> display-percent conversion, decided once.
 *
 * Rates such as `depositPct` / `defaultDepositPct` are STORED as decimals
 * (`0.5` = 50%) but DISPLAYED and EDITED as percentages. Cross that boundary
 * only through these helpers so precision never drifts between screens.
 *
 * NOT for `markupPct` / `wastePct`: those are already stored as whole
 * percentages (`20` = 20%) and must not be passed through either helper.
 */

/** Default number of decimal places shown for a percentage. */
export const PERCENT_DISPLAY_PRECISION = 1;

/** Decimal rate (0.125) -> display percent (12.5), rounded half-up. */
export function toDisplayPercent(
  decimal: number,
  precision: number = PERCENT_DISPLAY_PRECISION
): number {
  return roundToDecimals(decimal * 100, precision);
}

/** Display percent (12.5) -> decimal rate (0.125), free of float noise. */
export function fromDisplayPercent(pct: number): number {
  return roundToDecimals(pct / 100, 6);
}

/** Decimal rate -> label such as "50%" or "12.5%" (no trailing zeros). */
export function formatPercent(
  decimal: number,
  precision: number = PERCENT_DISPLAY_PRECISION
): string {
  return `${toDisplayPercent(decimal, precision)}%`;
}
