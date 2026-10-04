"use client";

export function SectionHead({
  title,
  kicker,
}: {
  title: string;
  kicker: string;
}) {
  return (
    <div className="pb-4 mb-5 border-b border-[var(--line)]">
      <h2 className="type-display text-[22px] leading-[1.2]">{title}</h2>
      <p className="mt-1 text-[14px] text-[var(--muted)]">{kicker}</p>
    </div>
  );
}

export function FieldRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /** Id of the single control this row labels, when there is one. */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-x-8 gap-y-1 py-3">
      <div className="md:pt-2.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="field-label mb-0">
            {label}
          </label>
        ) : (
          <div className="field-label mb-0">{label}</div>
        )}
        {hint && (
          <div className="mt-1 mb-1.5 md:mb-0 text-[13px] text-[var(--muted)] leading-[1.45] md:max-w-[180px]">
            {hint}
          </div>
        )}
      </div>
      <div className="min-w-0 pt-1 md:pt-0">{children}</div>
    </div>
  );
}

/** Wrapper kept for layout; `select.field` draws its own caret. */
export function SelWrap({ children }: { children: React.ReactNode }) {
  return <div className="relative w-full">{children}</div>;
}
