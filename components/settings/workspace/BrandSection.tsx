"use client";

import { BrandPreview } from "./BrandPreview";
import { FieldRow, SectionHead } from "./IdentitySection";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const SWATCHES = [
  { hex: "#c0341a", name: "Vermilion" },
  { hex: "#3d6b4a", name: "Sage" },
  { hex: "#b07a1a", name: "Burnt Gold" },
  { hex: "#1f4e6b", name: "Slate Blue" },
  { hex: "#5a2a4a", name: "Plum" },
  { hex: "#1a1a17", name: "Ink" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandSection({ form, licenseNumber, onChange }: Props) {
  const currentHex = form.brandColor.toLowerCase();

  return (
    <section className="mb-16 scroll-mt-20" id="brand">
      <SectionHead
        n="02"
        title="Brand & Quote Style"
        kicker="The look of every customer-facing page"
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-9 items-start">
        <div>
          <FieldRow label="Accent color">
            <div className="flex gap-2 flex-wrap mb-2.5">
              {SWATCHES.map((s) => {
                const active = s.hex.toLowerCase() === currentHex;
                return (
                  <button
                    key={s.hex}
                    type="button"
                    onClick={() => onChange({ brandColor: s.hex })}
                    className={[
                      "inline-flex items-center gap-2 px-2.5 py-1.5 rounded border bg-transparent cursor-pointer transition-colors",
                      active
                        ? "border-[var(--ink)]"
                        : "border-[var(--line)] hover:border-[var(--ink-2)]",
                    ].join(" ")}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-sm"
                      style={{
                        background: s.hex,
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)",
                      }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-2)]">
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="brand-hex"
                className="font-mono text-[10px] text-[var(--muted)] tracking-[.12em] uppercase"
              >
                Custom
              </label>
              <input
                id="brand-hex"
                value={form.brandColor}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onChange({
                    brandColor: HEX_RE.test(v) ? v.toLowerCase() : v,
                  });
                }}
                className="font-mono text-[12px] w-[110px] px-2.5 py-1.5 border border-[var(--line)] rounded-sm bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink-2)]"
              />
            </div>
          </FieldRow>

          <FieldRow
            label="Tagline"
            hint="Optional. Shown beneath the company name on the customer quote page."
          >
            <input
              type="text"
              value={form.tagline}
              maxLength={120}
              onChange={(e) => onChange({ tagline: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent text-[14px] focus:outline-none focus:border-[var(--ink-2)]"
            />
          </FieldRow>

          <FieldRow label="License footer">
            <label className="inline-flex items-start gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={form.showLicenseOnQuotes}
                onChange={(e) =>
                  onChange({ showLicenseOnQuotes: e.target.checked })
                }
                className="sr-only peer"
              />
              <span className="relative shrink-0 w-9 h-5 border border-[var(--line-2)] bg-[var(--surface-2)] rounded-full transition-colors peer-checked:bg-[var(--brand,var(--accent))] peer-checked:border-transparent">
                <span className="absolute top-px left-px w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="text-[13px] leading-[1.4]">
                Print license number on every quote
              </span>
            </label>
          </FieldRow>
        </div>

        <BrandPreview form={form} licenseNumber={licenseNumber} />
      </div>
    </section>
  );
}
