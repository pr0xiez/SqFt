"use client";

import { BackLink, MetaSep, PageHeader } from "@/components/ui/PageHeader";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";
import { formatShortDate, sourceName } from "@/lib/utils";

interface Props {
  customer: { name: string; source: string; createdAt: string };
  locations: CustomerLocationSummary[];
}

export function CustomerHeader({ customer, locations }: Props) {
  return (
    <PageHeader
      kicker={
        <>
          <BackLink href="/customers">Customers</BackLink>
          <MetaSep />
          <span>{sourceName(customer.source)}</span>
          <MetaSep />
          <span>Added {formatShortDate(customer.createdAt)}</span>
        </>
      }
      title={customer.name}
      meta={
        locations.length > 0 ? (
          <span>
            {locations[0].address}
            {locations.length > 1 ? ` · +${locations.length - 1} more` : ""}
          </span>
        ) : undefined
      }
    />
  );
}
