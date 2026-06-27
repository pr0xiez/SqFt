"use client";

import { useMemo, useState } from "react";
import {
  QuickCreatePanel,
  type QuickRow,
} from "@/components/quick-create/QuickCreatePanel";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useInvoiceableEstimates } from "@/lib/hooks/useInvoiceableEstimates";
import { fmtDollar } from "@/lib/utils";

/** What the chosen estimate needs to seed the invoice dialog. */
export interface QuickInvoiceTarget {
  estimateId: number;
  unbilled: number;
  defaultDepositPct: number;
}

/**
 * Quick invoice: search a customer's billable estimates (those with a
 * remaining balance), then hand the chosen one to the existing invoice dialog
 * so the user picks the amount before the draft is created.
 */
export function QuickInvoicePanel({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (target: QuickInvoiceTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const q = useDebouncedValue(query, 250);
  const { data, isFetching } = useInvoiceableEstimates(q);

  const items = data?.items ?? [];
  const rows = useMemo<QuickRow[]>(
    () =>
      items.map((c) => ({
        id: c.id,
        title: `№ ${c.estimateNumber}${c.address ? ` · ${c.address}` : ""}`,
        meta: `${c.customerName} · ${fmtDollar(c.unbilled)} unbilled · ${c.status}`,
      })),
    [items]
  );

  function onCreate() {
    const sel = items.find((c) => c.id === selectedId);
    if (!sel) return;
    onClose();
    onPick({
      estimateId: sel.id,
      unbilled: sel.unbilled,
      defaultDepositPct: data?.defaultDepositPct ?? 0.3,
    });
  }

  return (
    <QuickCreatePanel
      open
      onClose={onClose}
      title="New invoice"
      hint="Search for a customer to see estimates you can bill"
      placeholder="Search customers…"
      query={query}
      onQueryChange={(v) => {
        setQuery(v);
        setSelectedId(null);
      }}
      rows={rows}
      loading={isFetching}
      selectedId={selectedId}
      onSelect={setSelectedId}
      footerNote={
        selectedId === null
          ? "Select an estimate to continue"
          : "Estimate selected"
      }
      createLabel="Create invoice →"
      onCreate={onCreate}
      createDisabled={selectedId === null}
      creating={false}
    />
  );
}
