"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useSendEstimate } from "@/lib/hooks/useEstimates";

interface Props {
  estimateId: number;
  estimateNumber: number;
  orgName: string;
  customerEmail: string | null;
  hasToken: boolean;
  open: boolean;
  onClose: () => void;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function SendEstimateDialog({
  estimateId,
  estimateNumber,
  orgName,
  customerEmail,
  hasToken,
  open,
  onClose,
}: Props) {
  const send = useSendEstimate(estimateId);
  const { showToast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [regenerate, setRegenerate] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(customerEmail ?? "");
      setSubject(`Estimate #${estimateNumber} from ${orgName}`);
      setMessage("");
      setRegenerate(false);
    }
  }, [open, customerEmail, estimateNumber, orgName]);

  const canSend = isEmail(to) && subject.trim().length > 0 && !send.isPending;

  async function onSend() {
    try {
      const result = await send.mutateAsync({
        to: to.trim(),
        subject: subject.trim(),
        message: message.trim() || undefined,
        regenerateLink: regenerate || undefined,
      });
      if (result.customerEmailSaved) {
        showToast("Estimate sent");
      } else {
        showToast(
          "Estimate sent",
          "Couldn't update the customer's saved email — try again from their profile."
        );
      }
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send estimate to customer"
      sub="They'll get an email with a link to review and sign."
      maxWidth="480px"
    >
      <label
        className="block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1"
        htmlFor="send-to"
      >
        To
      </label>
      <input
        id="send-to"
        type="email"
        className="w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="janet@example.com"
        required
      />

      <label
        className="block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1"
        htmlFor="send-subject"
      >
        Subject
      </label>
      <input
        id="send-subject"
        type="text"
        className="w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      <label
        className="block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1"
        htmlFor="send-message"
      >
        Message (optional)
      </label>
      <textarea
        id="send-message"
        className="w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 min-h-[96px] resize-y focus:outline-none focus:border-[var(--ink)]"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Hi Janet — here's the estimate we discussed."
      />

      {hasToken && (
        <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)] mb-4">
          <input
            type="checkbox"
            checked={regenerate}
            onChange={(e) => setRegenerate(e.target.checked)}
          />
          Generate a new link (invalidates the old one)
        </label>
      )}

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
          {send.isPending ? "Sending…" : "Send estimate →"}
        </Button>
      </div>
    </Modal>
  );
}
