"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  if (!open) return null;

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/q/${token}/decline`, {
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[440px] w-[calc(100%-32px)] shadow-2xl">
        <h2
          id="decline-title"
          className="text-[20px] font-[700] tracking-[-0.02em] mb-1.5"
        >
          Decline this estimate?
        </h2>
        <p className="text-[13px] text-[var(--ink-2)] mb-4">
          No hard feelings — a quick note helps us improve.
        </p>
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
      </div>
    </div>
  );
}
