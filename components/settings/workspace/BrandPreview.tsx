import { formatPercent } from "@/lib/percent";

("use client");

import type { CSSProperties } from "react";
import { fmtDollar } from "@/lib/utils";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
};

export function BrandPreview({ form, licenseNumber }: Props) {
  const previewStyle = { "--brand": form.brandColor } as CSSProperties;
  return (
    <div className="xl:sticky xl:top-8" style={previewStyle}>
      <div className="flex justify-between gap-3 text-[13px] text-[var(--muted)] mb-2">
        <span className="font-[560] text-[var(--ink-2)]">Live preview</span>
        <span>Estimate · sample</span>
      </div>
      <div className="bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)] overflow-hidden">
        <div className="h-1.5" style={{ background: "var(--brand)" }} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-[var(--line)]">
            <div className="min-w-0">
              <div className="text-[16px] font-[700] tracking-[-.015em] break-words">
                {form.name || "Workspace"}
              </div>
              {form.tagline && (
                <div className="text-[12px] text-[var(--muted)] mt-0.5 max-w-[200px] leading-[1.3]">
                  {form.tagline}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[12px] text-[var(--muted)]">Estimate</div>
              <div className="type-figure text-[13px]">#Q-1047</div>
            </div>
          </div>

          <div className="py-3.5 flex flex-col gap-2.5">
            <PreviewLine name="Sand & refinish, red oak" amt="$2,940.00" />
            <PreviewLine name="LVP install, Tahoe collection" amt="$3,720.00" />
            <PreviewLine name="Underlayment & trim" amt="$485.00" />
          </div>

          <div className="pt-3 border-t border-[var(--line)] flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[14px] font-[600]">
              <span>Total</span>
              <span
                className="type-figure font-[700]"
                style={{ color: "var(--brand)" }}
              >
                $7,145.00
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[13px] text-[var(--muted)]">
              <span>
                Deposit ·{" "}
                <span className="type-figure">
                  {formatPercent(form.defaultDepositPct)}
                </span>
              </span>
              <span className="type-figure">
                {fmtDollar(7145 * form.defaultDepositPct)}
              </span>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-[var(--line)] flex justify-between gap-3 text-[12px] text-[var(--muted)]">
            <span>
              Valid{" "}
              <span className="type-figure">{form.defaultValidityDays}</span>{" "}
              days
            </span>
            {form.showLicenseOnEstimates && licenseNumber && (
              <span className="type-figure">{licenseNumber}</span>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-center text-[var(--muted)]">
        Sample numbers. Your saved settings apply to new estimates.
      </p>
    </div>
  );
}

function PreviewLine({ name, amt }: { name: string; amt: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
      <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {name}
      </div>
      <div className="type-figure text-right">{amt}</div>
    </div>
  );
}
