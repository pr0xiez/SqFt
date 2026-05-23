"use client";

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
                <option key={tz} value={tz}>
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

export function SectionHead({
  n,
  title,
  kicker,
}: {
  n: string;
  title: string;
  kicker: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3.5 pb-4 mb-6 border-b border-[var(--line)]">
      <div className="flex items-baseline gap-4">
        <div className="font-[700] text-[40px] leading-none tracking-[-.04em] text-[var(--accent)] opacity-90 tabular-nums">
          {n}
        </div>
        <div>
          <h2 className="text-[22px] font-[700] tracking-[-.02em] leading-[1.2]">
            {title}
          </h2>
          <div className="mt-0.5 text-[12px] text-[var(--muted)] italic">
            {kicker}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 py-2.5">
      <div className="pt-2">
        <div className="font-mono text-[10px] tracking-[.14em] uppercase text-[var(--muted)]">
          {label}
        </div>
        {hint && (
          <div className="mt-1.5 text-[12px] text-[var(--ink-2)] leading-[1.5] max-w-[200px]">
            {hint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SelWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-block w-full">
      {children}
      <span
        aria-hidden
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[10px] pointer-events-none"
      >
        ▾
      </span>
    </div>
  );
}
