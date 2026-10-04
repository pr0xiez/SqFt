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
    <section className="mb-14 scroll-mt-8" id="identity">
      <SectionHead title="Identity" kicker="Who you are on paper" />

      <FieldRow label="Company name" htmlFor="ws-company-name">
        <input
          id="ws-company-name"
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="field bg-[var(--surface)]"
        />
      </FieldRow>

      <FieldRow label="Timezone & locale">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <SelWrap>
            <select
              aria-label="Timezone"
              value={form.timezone}
              onChange={(e) => onChange({ timezone: e.target.value })}
              className="field bg-[var(--surface)]"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </SelWrap>
          <SelWrap>
            <select
              aria-label="Locale"
              value={form.locale}
              onChange={(e) => onChange({ locale: e.target.value })}
              className="field bg-[var(--surface)]"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
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
