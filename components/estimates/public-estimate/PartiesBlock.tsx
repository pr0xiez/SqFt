interface Props {
  customer: { name: string; address: string | null } | null;
  projectTitle: string;
}

export function PartiesBlock({ customer, projectTitle }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-9">
      <div>
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
          Prepared for
        </div>
        <div className="text-[18px] font-[600] tracking-[-0.015em] mb-1.5">
          {customer?.name ?? "—"}
        </div>
        {customer?.address && (
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--ink-2)] leading-relaxed whitespace-pre-line">
            {customer.address}
          </div>
        )}
      </div>
      <div>
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
          Project
        </div>
        <div className="text-[18px] font-[600] tracking-[-0.015em]">
          {projectTitle || "—"}
        </div>
      </div>
    </div>
  );
}
