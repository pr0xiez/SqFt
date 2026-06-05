"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { readApiError } from "@/lib/api/errors";

interface Props {
  token: string;
  open: boolean;
  onClose: () => void;
}

export function DeclineModal({ token, open, onClose }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimate-review/${token}/decline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok && res.status !== 409) {
        const { message } = await readApiError(res, `Failed (${res.status})`);
        throw new Error(message);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decline this estimate?"
      sub="No hard feelings — a quick note helps us improve."
      maxWidth="440px"
    >
      <textarea
        className="w-full text-[13px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2.5 rounded resize-y min-h-[96px] focus:outline-none focus:border-[var(--ink)]"
        placeholder="Optional — e.g., went with another vendor, scope changed, budget…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <div className="text-[12px] text-[var(--accent)] mt-2">{error}</div>
      )}
      <div className="flex gap-2 mt-4 justify-end">
        <button
          type="button"
          className="py-2.5 px-4 bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-2)] rounded-md text-[13px] font-[var(--font-mono)]"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="py-2.5 px-4 bg-[var(--surface-2)] text-[var(--accent)] border border-[var(--accent)] rounded-md text-[13px] font-[var(--font-mono)]"
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting ? "Declining…" : "Decline estimate"}
        </button>
      </div>
    </Modal>
  );
}
