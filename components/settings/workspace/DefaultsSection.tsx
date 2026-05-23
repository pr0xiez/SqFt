"use client";

import { FieldRow, SectionHead } from "./IdentitySection";
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
    <section className="mb-16 scroll-mt-20" id="defaults">
      <SectionHead
        n="03"
        title="Estimating Defaults"
        kicker="What new quotes inherit"
      />

      <div className="border border-[var(--line)] rounded bg-[var(--surface)] p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="font-mono text-[10px] tracking-[.14em] uppercase text-[var(--muted)]">
            Deposit
          </div>
          <div className="tabular-nums">
            <span className="font-[700] text-[28px] tracking-[-.03em] text-[var(--accent)]">
              {depositPct}
            </span>
            <span className="text-[14px] text-[var(--muted)] ml-0.5">%</span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={depositPct}
          onChange={(e) =>
            onChange({ defaultDepositPct: Number(e.target.value) / 100 })
          }
          className="w-full"
        />
        <div className="flex justify-between mt-1.5 font-mono text-[9px] text-[var(--muted)] tabular-nums">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      <FieldRow label="Quote validity">
        <div className="flex items-center gap-2.5 text-[13px] text-[var(--muted)]">
          <input
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
            className="w-[90px] px-2.5 py-2 border border-[var(--line)] rounded bg-transparent font-mono text-[14px] text-right tabular-nums focus:outline-none focus:border-[var(--ink-2)]"
          />
          <span>days from send</span>
        </div>
      </FieldRow>

      <FieldRow label="Measure unit">
        <div className="inline-flex p-0.5 border border-[var(--line)] rounded bg-[var(--surface)]">
          {UNITS.map((u) => {
            const active = form.defaultUnitLabel === u.val;
            return (
              <button
                key={u.val}
                type="button"
                onClick={() => onChange({ defaultUnitLabel: u.val })}
                className={[
                  "px-3 py-1.5 font-mono text-[11px] tracking-[.04em] border-0 cursor-pointer rounded-sm transition-colors",
                  active
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : "bg-transparent text-[var(--muted)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {u.label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow
        label="Default terms"
        hint="Pre-fills the Terms field on a fresh quote."
      >
        <textarea
          rows={4}
          maxLength={2000}
          value={form.defaultTerms}
          onChange={(e) => onChange({ defaultTerms: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent text-[13px] leading-[1.55] resize-y focus:outline-none focus:border-[var(--ink-2)]"
        />
      </FieldRow>
    </section>
  );
}
