"use client";

import { FieldRow, SectionHead } from "./_ui";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const UNITS: {
  val: WorkspaceSettingsForm["defaultUnitLabel"];
  label: string;
}[] = [
  { val: "ft²", label: "Square feet" },
  { val: "yd²", label: "Square yards" },
  { val: "m²", label: "Square meters" },
];

export function DefaultsSection({ form, onChange }: Props) {
  const depositPct = Math.round(form.defaultDepositPct * 100);

  return (
    <section className="mb-14 scroll-mt-8" id="defaults">
      <SectionHead
        title="Estimating defaults"
        kicker="What new estimates inherit"
      />

      <FieldRow label="Deposit" htmlFor="ws-deposit">
        <div className="flex items-center gap-4 max-w-[480px]">
          <div className="flex-1 min-w-0">
            <input
              id="ws-deposit"
              type="range"
              min={0}
              max={100}
              step={1}
              value={depositPct}
              onChange={(e) =>
                onChange({ defaultDepositPct: Number(e.target.value) / 100 })
              }
              className="w-full h-10 accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex justify-between -mt-1 type-figure text-[12px] text-[var(--muted)]">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="type-stat text-[26px] w-[72px] text-right shrink-0">
            {depositPct}
            <span className="text-[15px] text-[var(--muted)] ml-0.5">%</span>
          </div>
        </div>
      </FieldRow>

      <FieldRow label="Estimate validity" htmlFor="ws-validity">
        <div className="flex items-center gap-2.5 text-[14px] text-[var(--muted)]">
          <input
            id="ws-validity"
            type="number"
            min={1}
            max={365}
            value={form.defaultValidityDays}
            onChange={(e) =>
              onChange({
                defaultValidityDays: Math.max(
                  1,
                  Math.min(365, Number(e.target.value) || 21)
                ),
              })
            }
            className="field type-figure w-[96px] text-right bg-[var(--surface)]"
          />
          <span>days from send</span>
        </div>
      </FieldRow>

      <FieldRow label="Measure unit">
        <div className="seg flex-wrap">
          {UNITS.map((u) => {
            const active = form.defaultUnitLabel === u.val;
            return (
              <button
                key={u.val}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ defaultUnitLabel: u.val })}
              >
                {u.label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow
        label="Default terms"
        htmlFor="ws-terms"
        hint="Pre-fills the Terms field on a fresh estimate."
      >
        <textarea
          id="ws-terms"
          rows={4}
          maxLength={2000}
          value={form.defaultTerms}
          onChange={(e) => onChange({ defaultTerms: e.target.value })}
          className="field bg-[var(--surface)]"
        />
      </FieldRow>
    </section>
  );
}
