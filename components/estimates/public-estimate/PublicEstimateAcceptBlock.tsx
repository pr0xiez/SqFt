"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiError } from "@/lib/api/errors";

interface Props {
  token: string;
  onDeclineClick: () => void;
}

export function PublicEstimateAcceptBlock({ token, onDeclineClick }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimate-review/${token}/approve`, {
        method: "POST",
      });
      if (!res.ok && res.status !== 409) {
        const { message } = await readApiError(res, `Failed (${res.status})`);
        throw new Error(message);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-9 bg-[var(--surface)] border border-[var(--line-2)] rounded-lg p-8 print:hidden">
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
        Approve
      </div>
      <div className="text-[22px] font-[700] tracking-[-0.02em] mb-1.5 leading-tight">
        Ready to move forward?
      </div>
      <div className="text-[13px] text-[var(--ink-2)] leading-snug mb-6">
        Approve this estimate to get on the schedule. We'll follow up to confirm
        the details.
      </div>

      {error && (
        <div className="text-[13px] text-[var(--accent)] mb-3">{error}</div>
      )}

      <div className="flex gap-2.5 flex-wrap mt-2">
        <button
          type="button"
          className="flex-1 min-w-[200px] py-3.5 px-5 bg-[var(--accent)] text-white border-0 rounded-md text-[14px] font-[600] tracking-[-0.01em] inline-flex items-center justify-center gap-2 transition-all hover:bg-[var(--accent-l)] hover:-translate-y-px disabled:bg-[var(--line-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed disabled:transform-none"
          disabled={submitting}
          onClick={onApprove}
        >
          ✓ {submitting ? "Submitting…" : "Approve & get on the schedule"}
        </button>
        <button
          type="button"
          onClick={onDeclineClick}
          className="py-3.5 px-4 bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-2)] rounded-md text-[13px] font-[500] font-[var(--font-mono)] tracking-[.02em]"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
