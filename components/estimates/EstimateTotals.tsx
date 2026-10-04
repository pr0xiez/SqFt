"use client";

import type { ReactNode } from "react";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/cn";
import { fmtDollar } from "@/lib/utils";

interface Props {
  subtotal: number;
  markupPct: number;
  depositPct: number; // depositPctState
  markupAmt: number;
  total: number;
  deposit: number;
  readOnly: boolean;
  onCommitMarkup: (nextPct: number) => void;
  onCommitDeposit: (nextPct: number) => void;
}

/**
 * Totals under the line items. Figures right-align with the line subtotal
 * column at xl (the 44px remove column + cell padding sits to their right).
 */
const ROW =
  "flex items-center justify-between gap-4 px-4 xl:pl-4 xl:pr-[56px] py-2.5";

export function EstimateTotals({
  subtotal,
  markupPct,
  depositPct,
  markupAmt,
  total,
  deposit,
  readOnly,
  onCommitMarkup,
  onCommitDeposit,
}: Props) {
  return (
    <div className="border-t border-[var(--line)]">
      <div className="py-1.5 sm:ml-auto sm:max-w-[460px]">
        <TotalsRow label="Subtotal" figure={fmtDollar(subtotal)} />
        <TotalsRow
          label="Markup"
          control={
            <PctInline
              label="Markup"
              value={markupPct}
              readOnly={readOnly}
              onCommit={onCommitMarkup}
            />
          }
          figure={fmtDollar(markupAmt)}
        />
      </div>

      {/* Total: the one strong moment on the page */}
      <div
        className={cn(
          ROW,
          "py-4 bg-[var(--ink)] text-[var(--bg)] items-baseline"
        )}
      >
        <span className="text-[14.5px] font-[600]">Estimate total</span>
        <span className="type-stat text-[26px] md:text-[30px]">
          {fmtDollar(total)}
        </span>
      </div>

      {/* Deposit */}
      <div className="py-1.5 sm:ml-auto sm:max-w-[460px]">
        <TotalsRow
          label="Deposit"
          control={
            <PctInline
              label="Deposit"
              value={depositPct}
              readOnly={readOnly}
              onCommit={onCommitDeposit}
            />
          }
          figure={fmtDollar(deposit)}
          figureClassName="text-[var(--ok)]"
        />
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  control,
  figure,
  figureClassName,
}: {
  label: string;
  control?: ReactNode;
  figure: string;
  figureClassName?: string;
}) {
  return (
    <div className={ROW}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[14px] text-[var(--ink-2)]">{label}</span>
        {control}
      </div>
      <span
        className={cn("type-figure text-[14.5px] font-[600]", figureClassName)}
      >
        {figure}
      </span>
    </div>
  );
}

interface PctInlineProps {
  label: string;
  value: number;
  readOnly: boolean;
  onCommit: (next: number) => void;
}

function PctInline({ label, value, readOnly, onCommit }: PctInlineProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <DecimalInput
        aria-label={`${label} percent`}
        value={value}
        onCommit={(next) => {
          if (next === null) return;
          const clamped = Math.max(0, Math.min(100, next));
          if (clamped !== value) onCommit(clamped);
        }}
        formatOnBlur={false}
        disabled={readOnly}
        className="field type-figure min-h-[34px] h-[34px] w-[64px] px-2 text-right font-[600] disabled:bg-transparent disabled:border-transparent disabled:text-[var(--ink)] disabled:cursor-default disabled:w-auto disabled:max-w-[48px] disabled:px-0"
      />
      <span className="type-figure text-[13px] text-[var(--muted)]">%</span>
    </span>
  );
}
