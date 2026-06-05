"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useRecordPayment } from "@/lib/hooks/useInvoices";

// stripe is intentionally excluded — manual entry only (Stripe is a future integration).
const METHODS = ["check", "cash", "card", "ach", "other"] as const;

const labelCls =
  "block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1";
const inputCls =
  "w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]";

interface Props {
  invoiceId: number;
  estimateId: number;
  outstanding: number;
  open: boolean;
  onClose: () => void;
}

export function RecordPaymentDialog({
  invoiceId,
  estimateId,
  outstanding,
  open,
  onClose,
}: Props) {
  const record = useRecordPayment(invoiceId, estimateId);
  const { showToast } = useToast();
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<string>("check");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(String(outstanding));
      setMethod("check");
      setPaidAt("");
      setReference("");
      setNote("");
    }
  }, [open, outstanding]);

  const value = parseFloat(amount) || 0;
  const canSubmit = value > 0 && !record.isPending;

  async function onSubmit() {
    try {
      await record.mutateAsync({
        amount: value,
        method,
        paidAt: paidAt
          ? new Date(`${paidAt}T00:00:00`).toISOString()
          : undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      showToast("Payment recorded");
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to record payment"
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      maxWidth="440px"
    >
      <label className={labelCls} htmlFor="pay-amount">
        Amount
      </label>
      <input
        id="pay-amount"
        aria-label="Amount"
        type="number"
        className={inputCls}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <label className={labelCls} htmlFor="pay-method">
        Method
      </label>
      <select
        id="pay-method"
        aria-label="Method"
        className={inputCls}
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <label className={labelCls} htmlFor="pay-date">
        Date (optional — defaults to today)
      </label>
      <input
        id="pay-date"
        type="date"
        className={inputCls}
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
      />

      <label className={labelCls} htmlFor="pay-ref">
        Reference (optional)
      </label>
      <input
        id="pay-ref"
        type="text"
        className={inputCls}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Check #1182"
      />

      <label className={labelCls} htmlFor="pay-note">
        Note (optional)
      </label>
      <textarea
        id="pay-note"
        className={`${inputCls} min-h-[60px] resize-y`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!canSubmit}
          type="button"
        >
          {record.isPending ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </Modal>
  );
}
