"use client";

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
