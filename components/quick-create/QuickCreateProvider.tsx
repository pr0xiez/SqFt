"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { NewCustomerPanel } from "@/components/customers/NewCustomerPanel";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { QuickEstimatePanel } from "@/components/quick-create/QuickEstimatePanel";
import {
  QuickInvoicePanel,
  type QuickInvoiceTarget,
} from "@/components/quick-create/QuickInvoicePanel";
import { QuickSiteMeasurePanel } from "@/components/quick-create/QuickSiteMeasurePanel";
import type { EventFormDefaults } from "@/components/schedule/EventFormPanel";
import { ScheduleEventPanel } from "@/components/schedule/ScheduleEventPanel";

export type QuickCreateKind =
  | "customer"
  | "siteMeasure"
  | "estimate"
  | "invoice"
  | "event";

/** Module-level so the event form isn't re-seeded on every render. */
const NEW_EVENT_DEFAULTS: EventFormDefaults = { type: "visit" };

interface QuickCreateContextValue {
  /** Open the quick-create slide-over for the given record kind. */
  open: (kind: QuickCreateKind) => void;
}

const QuickCreateContext = createContext<QuickCreateContextValue | null>(null);

/**
 * Hosts the global quick-create launcher state: the new-customer panel, the
 * site-measure/estimate/invoice search slide-overs, the new-event form, and
 * the hand-off into the existing invoice dialog once a billable estimate is
 * chosen. Mount once, above the app shell, so the "+ New" triggers in the
 * sidebar, mobile tab bar and drawer can open it from anywhere.
 */
export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<QuickCreateKind | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<QuickInvoiceTarget | null>(
    null
  );

  const open = useCallback((k: QuickCreateKind) => setKind(k), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <QuickCreateContext.Provider value={value}>
      {children}

      {kind === "customer" && (
        <NewCustomerPanel open onClose={() => setKind(null)} />
      )}
      {kind === "siteMeasure" && (
        <QuickSiteMeasurePanel onClose={() => setKind(null)} />
      )}
      {kind === "estimate" && (
        <QuickEstimatePanel onClose={() => setKind(null)} />
      )}
      {kind === "invoice" && (
        <QuickInvoicePanel
          onClose={() => setKind(null)}
          onPick={setInvoiceTarget}
        />
      )}

      <ScheduleEventPanel
        open={kind === "event"}
        onClose={() => setKind(null)}
        defaults={NEW_EVENT_DEFAULTS}
      />

      {invoiceTarget && (
        <CreateInvoiceDialog
          open
          estimateId={invoiceTarget.estimateId}
          unbilled={invoiceTarget.unbilled}
          defaultDepositPct={invoiceTarget.defaultDepositPct}
          onClose={() => setInvoiceTarget(null)}
        />
      )}
    </QuickCreateContext.Provider>
  );
}

export function useQuickCreate(): QuickCreateContextValue {
  const ctx = useContext(QuickCreateContext);
  if (!ctx) {
    throw new Error("useQuickCreate must be used within a QuickCreateProvider");
  }
  return ctx;
}
