"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Estimate, UpdateEstimateInput } from "@/lib/hooks/useEstimates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { fmtDollar, liSubtotal } from "@/lib/utils";

interface Props {
  estimate: Estimate;
  onSave: (data: UpdateEstimateInput) => Promise<void>;
}

export function QuoteSummary({ estimate, onSave }: Props) {
  const [taxRate, setTaxRate] = useState(estimate.taxRate);
  const [markupPct, setMarkupPct] = useState(estimate.markupPct);
  const [depositPct, setDepositPct] = useState(estimate.depositPct);
  const [saving, setSaving] = useState(false);

  const rooms = (estimate.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );
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
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5 space-y-4">
      <h2 className="font-[var(--font-display)] text-[15px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
        Quote summary
      </h2>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          {
            label: "Tax rate (%)",
            value: taxRate * 100,
            onChange: (v: number) => setTaxRate(v / 100),
          },
          {
            label: "Markup (%)",
            value: markupPct,
            onChange: (v: number) => setMarkupPct(v),
          },
          {
            label: "Deposit (%)",
            value: depositPct * 100,
            onChange: (v: number) => setDepositPct(v / 100),
          },
        ].map(({ label, value, onChange }) => (
          <div key={label} className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
              {label}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={value}
              onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
              className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
            />
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-[var(--line)] pt-4 space-y-2">
        {[
          { label: "Subtotal", value: subtotal },
          { label: `Markup (${markupPct}%)`, value: markup },
          { label: `Tax (${(taxRate * 100).toFixed(1)}%)`, value: tax },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between items-baseline">
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              {label}
            </span>
            <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink-2)]">
              {fmtDollar(value)}
            </span>
          </div>
        ))}

        <div className="flex justify-between items-baseline pt-2 border-t border-[var(--line)]">
          <span className="font-[var(--font-display)] text-[15px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
            Total
          </span>
          <span className="font-[var(--font-display)] text-[28px] font-[700] text-[var(--ink)] tracking-[-0.025em] leading-none">
            {fmtDollar(total)}
          </span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Deposit ({(depositPct * 100).toFixed(0)}%)
          </span>
          <span className="font-[var(--font-mono)] text-[13px] font-[500] text-[var(--sage)]">
            {fmtDollar(deposit)}
          </span>
        </div>

        <div className="flex justify-between items-baseline pt-1">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
            Margin
          </span>
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--ink-2)]">
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>

      <Button variant="sage" onClick={handleSave} disabled={saving} size="sm">
        {saving ? "Saving…" : "Save quote settings"}
      </Button>
    </div>
  );
}
