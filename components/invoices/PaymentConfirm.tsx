"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  token: string;
  sessionId: string;
}

type ConfirmState = "checking" | "paid" | "processing" | "pending";

/**
 * Belt-and-suspenders reconcile: fires once on mount, POSTing the Checkout
 * Session ID to the confirm endpoint so the payment is recorded even if the
 * webhook races or is delayed.
 *
 * The confirmed banner renders ONLY after the server verifies the session is
 * paid ({ status: "paid" }). `?pay=success` and the session id are both
 * attacker-controllable on this unauthenticated page, so an unverified success
 * state must never show a "Payment received" confirmation. A failed or pending
 * verification shows a neutral finalizing message instead — the webhook remains
 * the source of truth.
 */
export function PaymentConfirm({ token, sessionId }: Props) {
  const didRun = useRef(false);
  const [state, setState] = useState<ConfirmState>("checking");

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    fetch(`/api/invoice-review/${token}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status?: string } | null) => {
        setState(
          data?.status === "paid"
            ? "paid"
            : data?.status === "processing"
              ? "processing"
              : "pending"
        );
      })
      .catch(() => setState("pending"));
  }, [token, sessionId]);

  if (state === "paid") {
    return (
      <div className="my-6 rounded-md bg-green-50 border border-green-200 px-5 py-4 text-[14px] font-[600] text-green-800">
        Payment received — thank you!
      </div>
    );
  }

  if (state === "processing") {
    // Async bank debit in flight — server-verified the session is complete but
    // unsettled. Honest copy: not a confirmation, not an error.
    return (
      <div className="my-6 rounded-md bg-blue-50 border border-blue-200 px-5 py-4 text-[14px] text-blue-800">
        Your bank payment is processing — this can take a few business days. The
        invoice will show as paid once it clears.
      </div>
    );
  }

  // Not yet verified — honest neutral state, never a false confirmation.
  return (
    <div className="my-6 rounded-md bg-[var(--surface)] border border-[var(--line)] px-5 py-4 text-[14px] text-[var(--muted)]">
      Finalizing your payment — this can take a moment.
    </div>
  );
}
