"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/icons";
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
    <section className="mt-10 pt-8 border-t border-[var(--line)] print:hidden">
      <div className="type-label mb-1.5">Approve</div>
      <h2 className="type-display text-[24px] sm:text-[28px] mb-2">
        Ready to move forward?
      </h2>
      <p className="text-[15px] text-[var(--ink-2)] leading-snug mb-6 max-w-[52ch]">
        Approve this estimate to get on the schedule. We'll follow up to confirm
        the details.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[var(--r)] bg-[var(--accent-wash)] px-3.5 py-2.5 text-[14px] text-[var(--accent-ink)]"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5">
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full sm:w-auto sm:flex-1 px-5"
          disabled={submitting}
          onClick={onApprove}
        >
          <CheckIcon aria-hidden="true" weight="bold" />
          {submitting ? "Submitting…" : "Approve & get on the schedule"}
        </Button>
        <Button
          type="button"
          variant="default"
          size="lg"
          className="w-full sm:w-auto"
          onClick={onDeclineClick}
        >
          Decline
        </Button>
      </div>
    </section>
  );
}
