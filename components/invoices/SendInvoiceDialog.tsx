"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useSendInvoice } from "@/lib/hooks/useInvoices";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const labelCls =
  "block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1";
const inputCls =
  "w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]";

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
      <label className={labelCls} htmlFor="inv-send-to">
        To
      </label>
      <input
        id="inv-send-to"
        type="email"
        className={inputCls}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="janet@example.com"
      />

      <label className={labelCls} htmlFor="inv-send-subject">
        Subject
      </label>
      <input
        id="inv-send-subject"
        type="text"
        className={inputCls}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSend}
          disabled={!canSend}
          type="button"
        >
          {send.isPending ? "Sending…" : alreadySent ? "Resend →" : "Send →"}
        </Button>
      </div>
    </Modal>
  );
}
