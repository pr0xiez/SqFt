"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { readApiError } from "@/lib/api/errors";

interface Props {
  token: string;
}

/**
 * POSTs to the checkout endpoint for the given invoice token, reads back the
 * Stripe Checkout URL, and redirects the customer. Disabled while the request
 * is in flight; surfaces errors via toast.
 */
export function PayInvoiceButton({ token }: Props) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function handlePay() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/invoice-review/${token}/checkout`, {
        method: "POST",
      });
      if (!res.ok) {
        const { message } = await readApiError(res, "Could not start checkout");
        showToast("Payment error", message);
        setPending(false);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      // Keep the button disabled through the navigation; it unmounts on redirect.
      window.location.assign(url);
    } catch {
      showToast("Payment error", "Could not connect to checkout");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={pending}
      className="inline-block bg-[var(--accent)] text-white px-6 py-3 rounded-md font-[600] disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Redirecting…" : "Pay now"}
    </button>
  );
}
