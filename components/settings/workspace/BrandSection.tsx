"use client";

import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { FieldRow, SectionHead } from "./_ui";
import { BrandPreview } from "./BrandPreview";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const SWATCHES = [
  { hex: "#c0341a", name: "Vermilion" },
  { hex: "#3d6b4a", name: "Sage" },
  { hex: "#b07a1a", name: "Burnt gold" },
  { hex: "#1f4e6b", name: "Slate blue" },
  { hex: "#5a2a4a", name: "Plum" },
  { hex: "#1a1a17", name: "Ink" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandSection({ form, licenseNumber, onChange }: Props) {
  const currentHex = form.brandColor.toLowerCase();

  return (
    <section className="mb-14 scroll-mt-8" id="brand">
      <SectionHead
        title="Brand & estimate style"
        kicker="The look of every customer-facing page"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-x-10 gap-y-6 items-start">
        <div className="min-w-0">
          <FieldRow label="Accent color">
            <div className="flex gap-2 flex-wrap mb-3">
              {SWATCHES.map((s) => {
                const active = s.hex.toLowerCase() === currentHex;
                return (
                  <button
                    key={s.hex}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ brandColor: s.hex })}
                    className={cn(
                      "inline-flex items-center gap-2 h-9 pl-2 pr-3 rounded-[var(--r)] border text-[13.5px] font-[500] cursor-pointer transition-colors",
                      active
                        ? "border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)]"
                        : "border-[var(--line-2)] text-[var(--ink-2)] hover:border-[var(--ink-2)] hover:bg-[var(--hover)]"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-4 rounded-[var(--r-in)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ink)_28%,transparent)]"
                      style={{ background: s.hex }}
                    />
                    {s.name}
                    {active ? (
                      <CheckIcon
                        aria-hidden="true"
                        weight="bold"
                        className="size-3.5 -mr-0.5"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="brand-hex"
                className="text-[13.5px] text-[var(--muted)]"
              >
                Custom
              </label>
              <span
                aria-hidden="true"
                className="size-[22px] shrink-0 rounded-[var(--r-in)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ink)_28%,transparent)]"
                style={{ background: form.brandColor }}
              />
              <input
                id="brand-hex"
                value={form.brandColor}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onChange({
                    brandColor: HEX_RE.test(v) ? v.toLowerCase() : v,
                  });
                }}
                className="field type-figure w-[120px] min-h-[34px] h-[34px] px-2.5 bg-[var(--surface)]"
              />
            </div>
          </FieldRow>

          <FieldRow
            label="Tagline"
            htmlFor="ws-tagline"
            hint="Optional. Shown beneath the company name on the customer estimate page."
          >
            <input
              id="ws-tagline"
              type="text"
              value={form.tagline}
              maxLength={120}
              onChange={(e) => onChange({ tagline: e.target.value })}
              className="field bg-[var(--surface)]"
            />
          </FieldRow>

          <FieldRow label="License footer">
            <label className="inline-flex items-center gap-3 cursor-pointer min-h-10">
              <input
                type="checkbox"
                checked={form.showLicenseOnEstimates}
                onChange={(e) =>
                  onChange({ showLicenseOnEstimates: e.target.checked })
                }
                className="sr-only peer"
              />
              <span
                aria-hidden="true"
                className="relative shrink-0 w-9 h-5 rounded-full border border-[var(--line-2)] bg-[var(--surface-2)] transition-colors peer-checked:bg-[var(--brand,var(--accent))] peer-checked:border-transparent peer-checked:[&>span]:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
              >
                <span className="absolute top-px left-px size-4 rounded-full bg-[var(--surface)] border border-[var(--line-2)] transition-transform duration-200 ease-[var(--ease)]" />
              </span>
              <span className="text-[14px] leading-[1.4]">
                Print license number on every estimate
              </span>
            </label>
          </FieldRow>
        </div>

        <BrandPreview form={form} licenseNumber={licenseNumber} />
      </div>
    </section>
  );
}
