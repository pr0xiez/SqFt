interface Props {
  estimateNumber: number;
  date: Date | string;
  org: {
    name: string;
    address: string | null;
    phone: string | null;
    licenseNumber: string | null;
    logo: string | null;
  };
}

export function Letterhead({ estimateNumber, date, org }: Props) {
  const dateLabel = new Date(date)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();

  return (
    <div className="flex items-start justify-between gap-6 pb-7 border-b border-[var(--line)] mb-8 flex-wrap">
      <div className="flex flex-col gap-1">
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em]">
          SiteMeasure &amp; Proposal
        </div>
        <div className="text-[42px] font-[700] tracking-[-0.03em] leading-none mt-2 sm:text-[42px] text-[32px]">
          Estimate
        </div>
        <div className="font-[var(--font-mono)] text-[13px] text-[var(--accent)] font-[600] mt-2 tracking-[.04em]">
          № {estimateNumber} · {dateLabel}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[14px] font-[700] tracking-[-0.01em]">
          {org.name}
        </div>
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] leading-relaxed mt-1">
          {org.address ? (
            <>
              {org.address}
              <br />
            </>
          ) : null}
          {org.phone ? (
            <>
              {org.phone}
              <br />
            </>
          ) : null}
          {org.licenseNumber ? <>License #{org.licenseNumber}</> : null}
        </div>
      </div>
    </div>
  );
}
