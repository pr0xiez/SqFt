"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { QuickEstimatePanel } from "@/components/quick-create/QuickEstimatePanel";
import {
  QuickInvoicePanel,
  type QuickInvoiceTarget,
} from "@/components/quick-create/QuickInvoicePanel";

export type QuickCreateKind = "estimate" | "invoice";

interface QuickCreateContextValue {
  /** Open the quick-create slide-over for the given record kind. */
  open: (kind: QuickCreateKind) => void;
}

const QuickCreateContext = createContext<QuickCreateContextValue | null>(null);

/**
 * Hosts the global quick-create launcher state: the estimate/invoice search
 * slide-overs, and the hand-off into the existing invoice dialog once a
 * billable estimate is chosen. Mount once, above the app shell, so the "+ New"
 * triggers in the sidebar and mobile drawer can open it from anywhere.
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

      {kind === "estimate" && (
        <QuickEstimatePanel onClose={() => setKind(null)} />
      )}
      {kind === "invoice" && (
        <QuickInvoicePanel
          onClose={() => setKind(null)}
          onPick={setInvoiceTarget}
        />
      )}

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
