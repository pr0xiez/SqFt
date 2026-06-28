import type Stripe from "stripe";
import { getStripe } from "./client";

export function buildCheckoutParams(input: {
  invoiceNumber: number;
  balanceDueCents: number;
  orgId: string;
  invoiceId: number;
  successUrl: string;
  cancelUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    invoiceId: String(input.invoiceId),
    orgId: input.orgId,
  };
  return {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.balanceDueCents,
          product_data: { name: `Invoice #${input.invoiceNumber}` },
        },
      },
    ],
    // No application_fee_amount: the platform takes nothing. The connected
    // account bears Stripe's processing fee (fees_collector: stripe), deducted
    // from its payout.
    payment_intent_data: { metadata },
    metadata,
  };
}

/** Create the session ON the connected account (direct charge). */
export async function createInvoiceCheckoutSession(
  connectedAccountId: string,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string
): Promise<{ id: string; url: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(params, {
    stripeAccount: connectedAccountId,
    idempotencyKey,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { id: session.id, url: session.url };
}
