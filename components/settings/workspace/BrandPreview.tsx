"use client";

import type { CSSProperties } from "react";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
};

export function BrandPreview({ form, licenseNumber }: Props) {
  const previewStyle = { "--brand": form.brandColor } as CSSProperties;
  return (
    <div className="sticky top-20" style={previewStyle}>
      <div className="flex justify-between font-mono text-[10px] tracking-[.18em] uppercase text-[var(--muted)] mb-2">
        <span>Live preview</span>
        <span>Quote · sample</span>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded overflow-hidden shadow-[var(--shadow)]">
        <div className="h-1.5" style={{ background: "var(--brand)" }} />
        <div className="p-5">
          <div className="flex items-start justify-between pb-3.5 border-b border-[var(--line)]">
            <div>
              <div className="text-[15px] font-[700] tracking-[-.015em]">
                {form.name || "Workspace"}
              </div>
              {form.tagline && (
                <div className="text-[10px] italic text-[var(--muted)] mt-0.5 max-w-[200px] leading-[1.25]">
                  {form.tagline}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-[9px] tracking-[.16em] uppercase text-[var(--muted)]">
                Quote
              </div>
              <div className="font-mono text-[12px] tabular-nums">#Q-1047</div>
            </div>
          </div>

          <div className="py-3.5 flex flex-col gap-2.5">
            <PreviewLine name="Sand & refinish — red oak" amt="$2,940.00" />
            <PreviewLine
              name="LVP install — Tahoe collection"
              amt="$3,720.00"
            />
            <PreviewLine name="Underlayment & trim" amt="$485.00" />
          </div>

          <div className="pt-3 border-t border-[var(--line)] flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[13px] font-[600] tracking-[-.005em]">
              <span>Total</span>
              <span
                className="font-[700] tabular-nums"
                style={{ color: "var(--brand)" }}
              >
                $7,145.00
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[12px] text-[var(--muted)]">
              <span>Deposit · {Math.round(form.defaultDepositPct * 100)}%</span>
              <span className="font-mono tabular-nums">
                ${(7145 * form.defaultDepositPct).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-[var(--line)] flex justify-between font-mono text-[9px] tracking-[.12em] uppercase text-[var(--muted)]">
            <span>Valid {form.defaultValidityDays} days</span>
            {form.showLicenseOnQuotes && licenseNumber && (
              <span>{licenseNumber}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 font-mono text-[10px] text-center text-[var(--muted)] italic">
        Sample numbers — your saved settings apply to new quotes.
      </div>
    </div>
  );
}

function PreviewLine({ name, amt }: { name: string; amt: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 text-[12px]">
      <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {name}
      </div>
      <div className="font-mono w-[78px] text-right tabular-nums">{amt}</div>
    </div>
  );
}
