import { fmtDollar } from "@/lib/utils";

interface Props {
  total: number;
  deposit: number;
  depositPct: number;
}

export function TotalsBlock(props: Props) {
  return (
    <div className="mt-6 flex flex-col sm:items-end">
      <div className="w-full sm:w-auto sm:min-w-[300px] flex items-baseline justify-between gap-6 pt-1">
        <div className="text-[15px] font-[650]">Total due</div>
        <div className="type-stat text-[32px] sm:text-[40px] text-[var(--ink)] text-right">
          {fmtDollar(props.total)}
        </div>
      </div>
      {props.depositPct > 0 && (
        <div className="mt-2 text-[13.5px] text-[var(--muted)] sm:text-right">
          Deposit due:{" "}
          <span className="type-figure text-[var(--ink-2)]">
            {fmtDollar(props.deposit)}
          </span>{" "}
          (
          <span className="type-figure">
            {Math.round(props.depositPct * 100)}%
          </span>
          )
        </div>
      )}
    </div>
  );
}
