"use client";

import { FieldRow, SectionHead, SelWrap } from "./_ui";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];
const LOCALES = ["en-US", "en-CA", "es-MX"];

export function IdentitySection({ form, onChange }: Props) {
  return (
    <section className="mb-16 scroll-mt-20" id="identity">
      <SectionHead n="01" title="Identity" kicker="Who you are on paper" />

      <FieldRow label="Company name">
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent text-[14px] focus:outline-none focus:border-[var(--ink-2)]"
        />
      </FieldRow>

      <FieldRow label="Timezone & locale">
        <div className="grid grid-cols-2 gap-2.5">
          <SelWrap>
            <select
              value={form.timezone}
              onChange={(e) => onChange({ timezone: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent font-mono text-[13px] tracking-[.02em] cursor-pointer pr-8 appearance-none focus:outline-none focus:border-[var(--ink-2)]"
            >
              {TIMEZONES.map((tz) => (
                <option
                  key={tz}
                  value={tz}
                  className="bg-[var(--surface)] text-[var(--ink)]"
                >
                  {tz}
                </option>
              ))}
            </select>
          </SelWrap>
          <SelWrap>
            <select
              value={form.locale}
              onChange={(e) => onChange({ locale: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent font-mono text-[13px] tracking-[.02em] cursor-pointer pr-8 appearance-none focus:outline-none focus:border-[var(--ink-2)]"
            >
              {LOCALES.map((l) => (
                <option
                  key={l}
                  value={l}
                  className="bg-[var(--surface)] text-[var(--ink)]"
                >
                  {l}
                </option>
              ))}
            </select>
          </SelWrap>
        </div>
      </FieldRow>
    </section>
  );
}
