import { fmtDollar } from "@/lib/utils";

interface Props {
  total: number;
  deposit: number;
  depositPct: number;
}

export function TotalsBlock(props: Props) {
  return (
    <div className="mt-6 flex flex-col items-end gap-2">
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
