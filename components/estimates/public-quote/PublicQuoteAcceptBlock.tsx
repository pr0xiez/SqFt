"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

const CONSENT_TEXT =
  "By typing my name and signing below, I consent to use an electronic signature, and agree this signature has the same legal effect as a handwritten signature on this quote.";

interface Props {
  token: string;
  customerEmail: string | null;
  onDeclineClick: () => void;
}

export function PublicQuoteAcceptBlock({
  token,
  customerEmail,
  onDeclineClick,
}: Props) {
  const router = useRouter();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(customerEmail ?? "");
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    hasInk;

  async function onAccept() {
    if (submitting) return;
    const sig = sigRef.current?.getDataUrl();
    if (!sig) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/q/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          signatureDataUrl: sig,
          consentText: CONSENT_TEXT,
        }),
      });
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Failed (${res.status})`);
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
        Sign &amp; Accept
      </div>
      <div className="text-[22px] font-[700] tracking-[-0.02em] mb-1.5 leading-tight">
        Approve this quote to get on the schedule.
      </div>
      <div className="text-[13px] text-[var(--ink-2)] leading-snug mb-6">
        {CONSENT_TEXT}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="sig-name"
            className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
          >
            Full name
          </label>
          <input
            id="sig-name"
            type="text"
            className="w-full text-[14px] border-0 border-b-[1.5px] border-[var(--line-2)] bg-transparent py-2 focus:outline-none focus:border-[var(--ink)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="sig-email"
            className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
          >
            Email (for receipt)
          </label>
          <input
            id="sig-email"
            type="email"
            className="w-full text-[14px] border-0 border-b-[1.5px] border-[var(--line-2)] bg-transparent py-2 focus:outline-none focus:border-[var(--ink)]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mb-5">
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
          Signature
        </span>
        <SignaturePad ref={sigRef} onChange={setHasInk} />
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] tracking-[.04em]">
            Use your finger or mouse
          </span>
          <button
            type="button"
            className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] hover:text-[var(--accent)]"
            onClick={() => sigRef.current?.clear()}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[13px] text-[var(--accent)] mb-3">{error}</div>
      )}

      <div className="flex gap-2.5 flex-wrap mt-5">
        <button
          type="button"
          className="flex-1 min-w-[200px] py-3.5 px-5 bg-[var(--accent)] text-white border-0 rounded-md text-[14px] font-[600] tracking-[-0.01em] inline-flex items-center justify-center gap-2 transition-all hover:bg-[var(--accent-l)] hover:-translate-y-px disabled:bg-[var(--line-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed disabled:transform-none"
          disabled={!valid || submitting}
          onClick={onAccept}
        >
          ✓ {submitting ? "Submitting…" : "Accept & sign quote"}
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
