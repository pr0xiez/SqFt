"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
    <Modal
      open={open}
      onClose={onClose}
      title={`Void invoice #${invoiceNumber}?`}
      sub="This can't be undone. The invoice will be excluded from billing totals."
      maxWidth="400px"
    >
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="default" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={onConfirm}
          disabled={voidInvoice.isPending}
          type="button"
        >
          {voidInvoice.isPending ? "Voiding…" : "Void invoice"}
        </Button>
      </div>
    </Modal>
  );
}
