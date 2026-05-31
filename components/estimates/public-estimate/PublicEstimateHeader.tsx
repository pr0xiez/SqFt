"use client";

interface Props {
  orgName: string;
  orgAddress: string | null;
}

export function PublicEstimateHeader({ orgName, orgAddress }: Props) {
  return (
    <header className="px-7 py-[18px] flex items-center gap-[14px] max-w-[880px] mx-auto">
      <div className="font-[800] text-[18px] tracking-[-0.025em]">
        <em className="not-italic text-[var(--accent)]">Sq</em>Ft
      </div>
      <div className="w-px h-[18px] bg-[var(--line-2)]" />
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] uppercase">
        {orgName}
        {orgAddress ? ` · ${orgAddress}` : ""}
      </div>
      <div className="ml-auto">
        <button
          type="button"
          className="font-[var(--font-mono)] text-[11px] px-3 py-[7px] border border-[var(--line-2)] bg-transparent text-[var(--ink-2)] rounded-md inline-flex items-center gap-1.5 hover:border-[var(--ink)] hover:text-[var(--ink)] hover:bg-[var(--surface)] print:hidden"
          onClick={() => window.print()}
        >
          ⤓ Download PDF
        </button>
      </div>
    </header>
  );
}
