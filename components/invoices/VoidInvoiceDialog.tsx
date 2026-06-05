"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useVoidInvoice } from "@/lib/hooks/useInvoices";

interface Props {
  invoiceId: number;
  estimateId: number;
  invoiceNumber: number;
  open: boolean;
  onClose: () => void;
}

export function VoidInvoiceDialog({
  invoiceId,
  estimateId,
  invoiceNumber,
  open,
  onClose,
}: Props) {
  const voidInvoice = useVoidInvoice(invoiceId, estimateId);
  const { showToast } = useToast();

  if (!open) return null;

  async function onConfirm() {
    try {
      await voidInvoice.mutateAsync();
      showToast("Invoice voided");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to void");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-invoice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[400px] w-[calc(100%-32px)] shadow-2xl">
        <h2
          id="void-invoice-title"
          className="text-[18px] font-[700] tracking-[-0.02em] mb-2"
        >
          Void invoice #{invoiceNumber}?
        </h2>
        <p className="text-[13px] text-[var(--ink-2)] mb-5">
          This can&apos;t be undone. The invoice will be excluded from billing
          totals.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={onConfirm}
            disabled={voidInvoice.isPending}
            type="button"
          >
            {voidInvoice.isPending ? "Voiding…" : "Void invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
