"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CreditCardIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { readApiError } from "@/lib/api/errors";

interface Props {
  token: string;
}

/**
 * Shown when checkout can't start and the server didn't say why: a bare 500,
 * a non-JSON gateway error, or no response at all (offline, DNS, timeout).
 */
const CHECKOUT_FALLBACK_MESSAGE =
  "We couldn't start checkout. Please try again in a moment, or contact the business if it keeps happening.";

/** The default toast (2.4s) disappears before a sentence can be read. */
const ERROR_TOAST_MS = 8000;

/**
 * Typed errors (STRIPE_ACCOUNT_RESTRICTED, INVOICE_ALREADY_PAID,
 * STRIPE_CHECKOUT_UNAVAILABLE, …) carry a customer-safe message worth showing.
 * INTERNAL only ever says "Server error", and UNKNOWN is readApiError's code
 * for a body that wasn't our envelope at all.
 */
function hasCustomerMessage(code: string): boolean {
  return code !== "INTERNAL" && code !== "UNKNOWN";
}

/**
 * POSTs to the checkout endpoint for the given invoice token, reads back the
 * Stripe Checkout URL, and redirects the customer. Disabled while the request
 * is in flight; surfaces errors via toast.
 */
export function PayInvoiceButton({ token }: Props) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  function fail(message: string) {
    showToast("Payment error", message, ERROR_TOAST_MS);
    setPending(false);
  }

  async function handlePay() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/invoice-review/${token}/checkout`, {
        method: "POST",
      });
      if (!res.ok) {
        const { code, message } = await readApiError(
          res,
          CHECKOUT_FALLBACK_MESSAGE
        );
        fail(hasCustomerMessage(code) ? message : CHECKOUT_FALLBACK_MESSAGE);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      // Keep the button disabled through the navigation; it unmounts on redirect.
      window.location.assign(url);
    } catch {
      fail(CHECKOUT_FALLBACK_MESSAGE);
    }
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="lg"
      onClick={handlePay}
      disabled={pending}
      className="w-full sm:w-auto sm:min-w-[220px]"
    >
      <CreditCardIcon aria-hidden="true" />
      {pending ? "Redirecting…" : "Pay now"}
    </Button>
  );
}
