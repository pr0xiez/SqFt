"use client";

import { Button } from "@/components/ui/Button";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";
import { formatShortDate, sourceName } from "@/lib/utils";

interface Props {
  customer: { name: string; source: string; createdAt: string };
  locations: CustomerLocationSummary[];
  onBack: () => void;
}

export function CustomerHeader({ customer, locations, onBack }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between mb-6 gap-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] uppercase tracking-[.1em] mb-2">
          <span>{sourceName(customer.source)}</span>
          <span className="w-px h-3 bg-[var(--line-2)]" />
          <span>Added {formatShortDate(customer.createdAt)}</span>
        </div>
        <h1 className="text-[40px] font-[700] leading-[1.02] tracking-[-0.03em]">
          {customer.name}
        </h1>
        {locations.length > 0 && (
          <div className="font-[var(--font-mono)] text-[11.5px] text-[var(--muted)] mt-2 tracking-[.02em]">
            {locations[0].address}
            {locations.length > 1 ? ` · +${locations.length - 1} more` : ""}
          </div>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button onClick={onBack}>← Customers</Button>
      </div>
    </div>
  );
}
