"use client";

import { DecimalInput } from "@/components/ui/DecimalInput";
import { fmtDollar } from "@/lib/utils";

interface Props {
  subtotal: number;
  feePct: number;
  markupPct: number;
  depositPct: number; // depositPctState
  feeAmt: number;
  markupAmt: number;
  total: number;
  deposit: number;
  margin: number;
  readOnly: boolean;
  onCommitFee: (nextPct: number) => void;
  onCommitMarkup: (nextPct: number) => void;
  onCommitDeposit: (nextPct: number) => void;
}

export function EstimateTotals({
  subtotal,
  feePct,
  markupPct,
  depositPct,
  feeAmt,
  markupAmt,
  total,
  deposit,
  margin,
  readOnly,
  onCommitFee,
  onCommitMarkup,
  onCommitDeposit,
}: Props) {
  return (
    <div className="border-t border-[var(--line)] bg-[var(--surface-2)]">
      {/* Subtotal */}
      <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-b border-[var(--line)]">
        <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-3">
          Subtotal
        </div>
        <div />
        <div className="px-3.5 py-2.5 text-[14px] font-[600]">
          {fmtDollar(subtotal)}
        </div>
        <div />
      </div>
      {/* Convenience fee */}
      <PctRow
        label="Convenience fee"
        valuePct={feePct}
        suffix={fmtDollar(feeAmt)}
        readOnly={readOnly}
        onCommit={onCommitFee}
      />
      {/* Markup */}
      <PctRow
        label="Markup (on subtotal + fee)"
        valuePct={markupPct}
        suffix={fmtDollar(markupAmt)}
        readOnly={readOnly}
        onCommit={onCommitMarkup}
      />
      {/* Total */}
      <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center bg-[var(--ink)] text-[var(--bg)] [html[data-theme=dark]_&]:bg-[var(--surface-2)] [html[data-theme=dark]_&]:border-t [html[data-theme=dark]_&]:border-[var(--line)]">
        <div className="px-3.5 py-3.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[.04em] opacity-80 col-span-4">
          Estimate total
        </div>
        <div className="px-3.5 py-3.5 text-[22px] font-[700] tracking-[-0.025em]">
          {fmtDollar(total)}
        </div>
        <div />
      </div>
      {/* Deposit + margin footer */}
      <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-t border-[var(--line)]">
        <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-2 flex items-center gap-2">
          <span>Deposit</span>
          <PctInline
            value={depositPct}
            readOnly={readOnly}
            onCommit={onCommitDeposit}
          />
        </div>
        <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em]">
          Margin {margin.toFixed(1)}%
        </div>
        <div />
        <div className="px-3.5 py-2.5 text-[13px] font-[600] text-[var(--sage)]">
          {fmtDollar(deposit)}
        </div>
        <div />
      </div>
    </div>
  );
}

interface PctRowProps {
  label: string;
  valuePct: number;
  suffix: string;
  readOnly: boolean;
  onCommit: (nextPct: number) => void;
}

function PctRow({ label, valuePct, suffix, readOnly, onCommit }: PctRowProps) {
  return (
    <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-b border-[var(--line)]">
      <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-3">
        {label}
      </div>
      <div className="px-2 py-2 flex items-center gap-1.5">
        <PctInline value={valuePct} readOnly={readOnly} onCommit={onCommit} />
      </div>
      <div className="px-3.5 py-2.5 text-[14px] font-[600]">{suffix}</div>
      <div />
    </div>
  );
}

interface PctInlineProps {
  value: number;
  readOnly: boolean;
  onCommit: (next: number) => void;
}

function PctInline({ value, readOnly, onCommit }: PctInlineProps) {
  return (
    <>
      <DecimalInput
        value={value}
        onCommit={(next) => {
          if (next === null) return;
          const clamped = Math.max(0, Math.min(100, next));
          if (clamped !== value) onCommit(clamped);
        }}
        formatOnBlur={false}
        disabled={readOnly}
        className="w-[50px] font-[var(--font-mono)] text-[13px] font-[600] text-right bg-transparent border-none p-0 focus:outline-none focus:bg-[var(--surface)] disabled:cursor-default"
      />
      <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
        %
      </span>
    </>
  );
}
