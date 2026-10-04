"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PaperPlaneTiltIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useSendInvoice } from "@/lib/hooks/useInvoices";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

interface Props {
  invoiceId: number;
  estimateId: number;
  invoiceNumber: number;
  customerEmail: string | null;
  alreadySent: boolean;
  open: boolean;
  onClose: () => void;
}

export function SendInvoiceDialog({
  invoiceId,
  estimateId,
  invoiceNumber,
  customerEmail,
  alreadySent,
  open,
  onClose,
}: Props) {
  const send = useSendInvoice(invoiceId, estimateId);
  const { showToast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (open) {
      setTo(customerEmail ?? "");
      setSubject(`Invoice #${invoiceNumber}`);
    }
  }, [open, customerEmail, invoiceNumber]);

  const canSend = isEmail(to) && subject.trim().length > 0 && !send.isPending;

  async function onSend() {
    try {
      await send.mutateAsync({ to: to.trim(), subject: subject.trim() });
      showToast(alreadySent ? "Invoice resent" : "Invoice sent");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alreadySent ? "Resend invoice" : "Send invoice to customer"}
      maxWidth="460px"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="inv-send-to">
            To
          </label>
          <input
            id="inv-send-to"
            type="email"
            className="field"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="janet@example.com"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="inv-send-subject">
            Subject
          </label>
          <input
            id="inv-send-subject"
            type="text"
            className="field"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
        <Button variant="default" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSend}
          disabled={!canSend}
          type="button"
        >
          {send.isPending ? "Sending…" : alreadySent ? "Resend" : "Send"}
          {send.isPending ? null : <PaperPlaneTiltIcon aria-hidden="true" />}
        </Button>
      </div>
    </Modal>
  );
}
