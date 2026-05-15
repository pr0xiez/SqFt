import { fmtDollar } from "@/lib/utils";

interface Props {
  subtotal: number;
  markup: number;
  markupPct: number;
  tax: number;
  taxRate: number;
  total: number;
  deposit: number;
  depositPct: number;
}

export function TotalsBlock(props: Props) {
  return (
    <div className="mt-6 flex flex-col items-end gap-2">
      <Row label="Subtotal" value={fmtDollar(props.subtotal)} />
      <Row
        label={`Tax · ${(props.taxRate * 100).toFixed(1)}%`}
        value={fmtDollar(props.tax)}
      />
      {props.markupPct > 0 && (
        <Row
          label={`Labor & margin · ${props.markupPct}%`}
          value={fmtDollar(props.markup)}
        />
      )}
      <div className="h-[1.5px] bg-[var(--ink)] w-[280px] my-1.5" />
      <div className="grid grid-cols-[auto_140px] gap-8 items-baseline">
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink)] tracking-[.06em] uppercase font-[600] text-right">
          Total due
        </div>
        <div className="text-[32px] font-[700] tracking-[-0.025em] text-right text-[var(--accent)]">
          {fmtDollar(props.total)}
        </div>
      </div>
      {props.depositPct > 0 && (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-1">
          Deposit due: {fmtDollar(props.deposit)} (
          {Math.round(props.depositPct * 100)}%)
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_140px] gap-8 items-baseline">
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] text-right">
        {label}
      </div>
      <div className="font-[var(--font-mono)] text-[13px] font-[600] text-right text-[var(--ink-2)]">
        {value}
      </div>
    </div>
  );
}
