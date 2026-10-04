import { fmtDollar, type LineItemCalc } from "@/lib/utils";

interface Props {
  lineItems: LineItemCalc[];
  /** Per-line resolved subtotal keyed by `LineItem.id`. `null` = unresolvable. */
  subtotals: Map<number, number | null>;
}

const ROW = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:gap-x-6";

export function LineItemsTable({ lineItems, subtotals }: Props) {
  if (lineItems.length === 0) return null;
  return (
    <section className="mb-2">
      <h2 className="text-[14px] font-[620] text-[var(--ink)] mb-3">
        Line items
      </h2>
      <div
        className={`${ROW} pb-2.5 border-b border-[var(--line-2)] text-[13px] font-[500] text-[var(--muted)]`}
      >
        <div>Description</div>
        <div className="text-right min-w-[96px]">Subtotal</div>
      </div>
      {lineItems.map((li) => {
        const sub = subtotals.get(li.id) ?? null;
        return (
          <div
            key={li.id}
            className={`${ROW} py-3.5 border-b border-[var(--line)] items-baseline`}
          >
            <div className="min-w-0">
              <div className="text-[15px] font-[560] tracking-[-0.005em]">
                {li.name}
              </div>
              {li.description ? (
                <div className="mt-1 text-[13.5px] text-[var(--muted)] whitespace-pre-wrap">
                  {li.description}
                </div>
              ) : null}
            </div>
            <div className="type-figure text-[14.5px] text-right min-w-[96px]">
              {sub != null ? fmtDollar(sub) : "-"}
            </div>
          </div>
        );
      })}
    </section>
  );
}
