"use client";

import { type ReactNode, useState } from "react";
import { CustomerInfoCard } from "@/components/customers/CustomerInfoCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckIcon, PencilSimpleIcon } from "@/components/ui/icons";
import { formatShortDate, sourceName } from "@/lib/utils";

interface Props {
  customer: {
    name: string;
    phone?: string | null;
    email?: string | null;
    source: string;
    notes?: string | null;
    createdAt: string;
  };
  onField: (field: string, value: string) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 border-t border-[var(--line)] first:border-t-0 first:pt-0">
      <dt className="text-[13px] text-[var(--muted)]">{label}</dt>
      <dd className="text-[14px] text-[var(--ink)] min-w-0 break-words">
        {children}
      </dd>
    </div>
  );
}

const LINK =
  "text-[var(--ink)] no-underline hover:underline underline-offset-[3px]";

/**
 * Contact details as a quiet read-only summary; Edit swaps in the
 * save-on-blur form. Keeps the hub about the customer's jobs, not a form.
 */
export function CustomerContactCard({ customer, onField }: Props) {
  const [editing, setEditing] = useState(false);
  return (
    <Card
      title="Contact"
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
        >
          {editing ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <PencilSimpleIcon aria-hidden="true" />
          )}
          {editing ? "Done" : "Edit"}
        </Button>
      }
    >
      {editing ? (
        <CustomerInfoCard customer={customer} onField={onField} />
      ) : (
        <dl>
          <Row label="Phone">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className={`${LINK} type-figure`}
              >
                {customer.phone}
              </a>
            ) : (
              "-"
            )}
          </Row>
          <Row label="Email">
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className={LINK}>
                {customer.email}
              </a>
            ) : (
              "-"
            )}
          </Row>
          <Row label="Source">{sourceName(customer.source)}</Row>
          <Row label="Added">{formatShortDate(customer.createdAt)}</Row>
          <Row label="Notes">
            {customer.notes ? (
              <span className="whitespace-pre-wrap">{customer.notes}</span>
            ) : (
              "-"
            )}
          </Row>
        </dl>
      )}
    </Card>
  );
}
