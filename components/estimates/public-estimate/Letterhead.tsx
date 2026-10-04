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
  const dateLabel = new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="pb-7 sm:pb-8 border-b border-[var(--line)] mb-7 sm:mb-8">
      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] text-[var(--muted)]">
            Site Measure &amp; Proposal
          </p>
          <h1 className="type-display text-[36px] sm:text-[46px] mt-1.5">
            Estimate
          </h1>
          <p className="type-figure text-[13.5px] text-[var(--ink-2)] mt-2.5">
            #{estimateNumber} · {dateLabel}
          </p>
        </div>
        <div className="min-w-0 sm:text-right">
          {org.logo ? (
            // biome-ignore lint/performance/noImgElement: customer-facing static logo URL
            <img
              src={org.logo}
              alt={org.name}
              height={40}
              className="h-10 w-auto mb-2.5 sm:ml-auto"
            />
          ) : null}
          <div className="type-heading">{org.name}</div>
          <div className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">
            {org.address ? <div>{org.address}</div> : null}
            {org.phone ? <div className="type-figure">{org.phone}</div> : null}
            {org.licenseNumber ? (
              <div>
                License{" "}
                <span className="type-figure">#{org.licenseNumber}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
