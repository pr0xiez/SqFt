"use client";

import { useEffect, useRef } from "react";

interface Props {
  token: string;
  sessionId: string;
}

/**
 * Belt-and-suspenders reconcile: fires once on mount, POSTing the Checkout
 * Session ID to the confirm endpoint so the payment is recorded even if the
 * webhook races or is delayed. On failure the webhook still records it — so
 * we show a soft success message regardless.
 */
export function PaymentConfirm({ token, sessionId }: Props) {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    fetch(`/api/invoice-review/${token}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {
      // Silently ignore — the webhook will record the payment.
    });
  }, [token, sessionId]);

  return (
    <div className="my-6 rounded-md bg-green-50 border border-green-200 px-5 py-4 text-[14px] font-[600] text-green-800">
      Payment received — thank you!
    </div>
  );
}
