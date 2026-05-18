import { fmtDollar, type LineItemCalc } from "@/lib/utils";

interface Props {
  lineItems: LineItemCalc[];
  /** Per-line resolved subtotal keyed by `LineItem.id`. `null` = unresolvable. */
  subtotals: Map<number, number | null>;
}

export function LineItemsTable({ lineItems, subtotals }: Props) {
  if (lineItems.length === 0) return null;
  return (
    <>
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-3.5">
        Line items
      </div>
      <div className="mb-6">
        <div className="grid grid-cols-[1fr_140px] gap-3.5 pb-2.5 border-b-[1.5px] border-[var(--ink)] font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] font-[600]">
          <div>Description</div>
          <div className="text-right">Subtotal</div>
        </div>
        {lineItems.map((li) => {
          const sub = subtotals.get(li.id) ?? null;
          return (
            <div
              key={li.id}
              className="grid grid-cols-[1fr_140px] gap-3.5 py-3.5 border-b border-[var(--line)] items-baseline last:border-b-0"
            >
              <div>
                <div className="text-[14px] font-[500] tracking-[-0.005em]">
                  {li.name}
                </div>
                {li.description ? (
                  <div className="mt-1 text-[12px] text-[var(--muted)] whitespace-pre-wrap">
                    {li.description}
                  </div>
                ) : null}
              </div>
              <div className="text-[14px] text-right font-[600] tracking-[-0.01em]">
                {sub != null ? fmtDollar(sub) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
