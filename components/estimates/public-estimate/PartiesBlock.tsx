interface Props {
  customer: { name: string; address: string | null } | null;
}

export function PartiesBlock({ customer }: Props) {
  return (
    <div className="mb-8 sm:mb-9">
      <div className="type-label mb-1.5">Prepared for</div>
      <div className="text-[18px] font-[620] tracking-[-0.015em]">
        {customer?.name ?? "-"}
      </div>
      {customer?.address && (
        <div className="mt-1 text-[14px] text-[var(--ink-2)] leading-relaxed whitespace-pre-line">
          {customer.address}
        </div>
      )}
    </div>
  );
}
