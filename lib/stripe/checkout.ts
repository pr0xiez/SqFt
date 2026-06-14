import type Stripe from "stripe";

export interface CheckoutParamsInput {
  invoiceId: number;
  orgId: string;
  connectAccountId: string;
  amountCents: number;
  invoiceNumber: number;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  currency?: string;
}

/**
 * Build destination-charge Checkout Session params. Pure — no SDK, no network.
 * `on_behalf_of` is non-optional: it puts the contractor's name on the
 * customer's statement and is required for the contractor-branded flow.
 */
export function buildCheckoutSessionParams(
  i: CheckoutParamsInput
): Stripe.Checkout.SessionCreateParams {
  const metadata = { invoiceId: String(i.invoiceId), orgId: i.orgId };
  return {
    mode: "payment",
    payment_method_types: ["card", "us_bank_account"],
    payment_method_options: {
      us_bank_account: { verification_method: "instant" },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: i.currency ?? "usd",
          unit_amount: i.amountCents,
          product_data: { name: `Invoice #${i.invoiceNumber}` },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: { destination: i.connectAccountId },
      on_behalf_of: i.connectAccountId,
      metadata,
    },
    metadata,
    customer_email: i.customerEmail ?? undefined,
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
  };
}
