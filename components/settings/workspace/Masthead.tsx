type Props = { companyName: string; licenseNumber: string | null };

export function Masthead({ companyName, licenseNumber: _ }: Props) {
  return (
    <header className="px-12 pt-12 pb-9 border-b border-[var(--line)]">
      <div className="max-w-[1180px] mx-auto">
        <div className="flex items-baseline gap-2.5 font-mono text-[10px] tracking-[.18em] uppercase text-[var(--muted)] mb-3.5">
          <span>Settings</span>
          <span className="text-[var(--line-2)]">/</span>
          <span className="text-[var(--ink-2)]">Workspace</span>
        </div>
        <div className="flex items-end justify-between gap-8 flex-wrap">
          <h1 className="text-[64px] font-[700] tracking-[-.035em] leading-[.95]">
            Workspace
            <br />
            <span className="italic font-[400] text-[var(--muted)]">
              — settings &amp; customs.
            </span>
          </h1>
          <p className="max-w-[360px] text-[13px] leading-[1.55] text-[var(--ink-2)] pb-2">
            How{" "}
            <strong className="text-[var(--ink)] font-[600]">
              {companyName || "your business"}
            </strong>{" "}
            shows up to customers, what your defaults look like, and who can do
            what. Changes apply to every quote and invoice going forward.
          </p>
        </div>
      </div>
    </header>
  );
}
