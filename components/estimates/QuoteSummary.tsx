"use client";

import { useState } from "react";
import type { Estimate, UpdateEstimateInput } from "@/lib/hooks/useEstimates";
import type { RoomItem, LineItemCalc } from "@/lib/utils";
import { liSubtotal, fmtDollar } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface Props {
  estimate: Estimate;
  onSave: (data: UpdateEstimateInput) => Promise<void>;
}

export function QuoteSummary({ estimate, onSave }: Props) {
  const [taxRate, setTaxRate] = useState(estimate.taxRate);
  const [markupPct, setMarkupPct] = useState(estimate.markupPct);
  const [depositPct, setDepositPct] = useState(estimate.depositPct);
  const [saving, setSaving] = useState(false);

  const rooms = (estimate.items ?? []).filter((i): i is RoomItem => i.type === "room");
  const lineItems = (estimate.lineItems ?? []) as LineItemCalc[];

  const subtotal = lineItems.reduce((sum, li) => {
    const st = liSubtotal(li, rooms);
    return sum + (st ?? 0);
  }, 0);

  const markup = subtotal * (markupPct / 100);
  const beforeTax = subtotal + markup;
  const tax = beforeTax * taxRate;
  const total = beforeTax + tax;
  const deposit = total * depositPct;
  const margin = total > 0 ? ((total - subtotal) / total) * 100 : 0;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ taxRate, markupPct, depositPct });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-cream border-[1.5px] border-oak shadow-[3px_3px_0_var(--manila)] p-5 space-y-4">
      <h2 className="font-[var(--font-display)] text-lg font-bold text-oak">
        Quote Summary
      </h2>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Tax rate */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Tax rate (%)
          </label>
          <input
            type="number"
            min="0"
            max="30"
            step="0.1"
            value={taxRate * 100}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) / 100 || 0)}
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
          />
        </div>

        {/* Markup */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Markup (%)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={markupPct}
            onChange={(e) => setMarkupPct(parseFloat(e.target.value) || 0)}
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
          />
        </div>

        {/* Deposit */}
        <div className="flex flex-col gap-1">
          <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
            Deposit (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="5"
            value={depositPct * 100}
            onChange={(e) => setDepositPct(parseFloat(e.target.value) / 100 || 0)}
            className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="border-t-2 border-oak pt-4 space-y-2">
        {[
          { label: "Subtotal", value: subtotal, style: "" },
          { label: `Markup (${markupPct}%)`, value: markup, style: "" },
          { label: `Tax (${(taxRate * 100).toFixed(1)}%)`, value: tax, style: "" },
        ].map(({ label, value, style }) => (
          <div key={label} className="flex justify-between items-baseline">
            <span className="font-[var(--font-mono)] text-xs text-driftwood">{label}</span>
            <span className={`font-[var(--font-mono)] text-xs text-oak ${style}`}>
              {fmtDollar(value)}
            </span>
          </div>
        ))}

        <div className="flex justify-between items-baseline pt-2 border-t-2 border-oak">
          <span className="font-[var(--font-display)] text-base font-bold text-oak">Total</span>
          <span className="font-[var(--font-display)] text-xl font-black text-oak">
            {fmtDollar(total)}
          </span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="font-[var(--font-mono)] text-xs text-driftwood">
            Deposit ({(depositPct * 100).toFixed(0)}%)
          </span>
          <span className="font-[var(--font-mono)] text-sm font-medium text-sage">
            {fmtDollar(deposit)}
          </span>
        </div>

        <div className="flex justify-between items-baseline pt-1">
          <span className="font-[var(--font-mono)] text-[10px] text-driftwood">Margin</span>
          <span className="font-[var(--font-mono)] text-[10px] text-oak">
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>

      <Button
        variant="sage"
        onClick={handleSave}
        disabled={saving}
        size="sm"
      >
        {saving ? "Saving…" : "Save Quote Settings"}
      </Button>
    </div>
  );
}
