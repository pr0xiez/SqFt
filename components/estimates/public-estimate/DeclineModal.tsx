"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
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
      sub="No hard feelings. A quick note helps us improve."
      maxWidth="440px"
    >
      <label className="field-label" htmlFor="decline-reason">
        Reason (optional)
      </label>
      <textarea
        id="decline-reason"
        className="field min-h-[104px] resize-y"
        placeholder="e.g. went with another vendor, scope changed, budget…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <div role="alert" className="field-error mt-2">
          {error}
        </div>
      )}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
        <Button type="button" variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting ? "Declining…" : "Decline estimate"}
        </Button>
      </div>
    </Modal>
  );
}
