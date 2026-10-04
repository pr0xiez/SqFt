"use client";

import type { ReactNode } from "react";
import { mapsHref } from "@/components/customers/LocationsCard";
import {
  EnvelopeSimpleIcon,
  MapPinIcon,
  PhoneIcon,
} from "@/components/ui/icons";
import {
  Breadcrumbs,
  MetaSep,
  PageHeader,
  recordTrail,
} from "@/components/ui/PageHeader";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";

interface Props {
  customer: { name: string; phone?: string | null; email?: string | null };
  locations: CustomerLocationSummary[];
  actions?: ReactNode;
}

const META_LINK =
  "inline-flex items-center gap-1.5 min-h-[32px] text-[var(--ink-2)] no-underline hover:text-[var(--ink)] hover:underline underline-offset-[3px]";

/**
 * The hub's header: the customer's name with one-tap contact (call, email,
 * directions) under it, and the next things to do with them on the right.
 */
export function CustomerHeader({ customer, locations, actions }: Props) {
  const primary = locations[0];
  const items: ReactNode[] = [];
  if (customer.phone) {
    items.push(
      <a key="phone" href={`tel:${customer.phone}`} className={META_LINK}>
        <PhoneIcon aria-hidden="true" className="size-[15px] shrink-0" />
        <span className="type-figure">{customer.phone}</span>
      </a>
    );
  }
  if (customer.email) {
    items.push(
      <a
        key="email"
        href={`mailto:${customer.email}`}
        className={`${META_LINK} min-w-0 break-all`}
      >
        <EnvelopeSimpleIcon
          aria-hidden="true"
          className="size-[15px] shrink-0"
        />
        {customer.email}
      </a>
    );
  }
  if (primary) {
    items.push(
      <a
        key="address"
        href={mapsHref(primary.address)}
        target="_blank"
        rel="noopener noreferrer"
        className={META_LINK}
      >
        <MapPinIcon aria-hidden="true" className="size-[15px] shrink-0" />
        <span>
          {primary.address}
          {locations.length > 1 ? ` · +${locations.length - 1} more` : ""}
        </span>
      </a>
    );
  }

  return (
    <PageHeader
      kicker={<Breadcrumbs items={recordTrail({})} />}
      title={customer.name}
      meta={
        items.length > 0
          ? items.flatMap((item, i) =>
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order separators between the meta links
              i === 0 ? [item] : [<MetaSep key={`sep-${i}`} />, item]
            )
          : undefined
      }
      actions={actions}
    />
  );
}
