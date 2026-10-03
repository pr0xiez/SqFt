import Stripe from "stripe";
import { getStripe } from "./client";

/**
 * Payment methods Checkout must never offer. SqFt takes card (Apple Pay and
 * Google Pay ride on `card`) and ACH debit (`us_bank_account`) — the two
 * capabilities requested at account creation — plus Link, Stripe's own wallet
 * (pays by card or bank), which this parameter can't exclude anyway.
 *
 * Checkout shows the connected account's *dynamic* payment methods: whatever
 * the contractor has switched on in their own Stripe Dashboard (QA saw Cash
 * App Pay, Klarna, Affirm, Amazon Pay and Zip). Don't "fix" that with
 * `payment_method_types` — that turns dynamic payment methods off entirely;
 * excluding keeps them and just drops these.
 *
 * To offer one of these, delete its line. Every entry must be a valid
 * `ExcludedPaymentMethodType` for the API version pinned in ./client.ts:
 * Stripe rejects the whole session on an unknown value, so keep the type
 * annotation (it turns a typo into a compile error).
 */
export const EXCLUDED_PAYMENT_METHOD_TYPES: readonly Stripe.Checkout.SessionCreateParams.ExcludedPaymentMethodType[] =
  [
    // Buy now, pay later.
    "affirm",
    "afterpay_clearpay",
    "klarna",
    "sunbit",
    "zip",
    // Third-party wallets.
    "alipay",
    "amazon_pay",
    "cashapp",
    "paypal",
    "revolut_pay",
    "wechat_pay",
    // Other USD rails: Canadian pre-authorized debit, stablecoins, and bank
    // transfers pushed into a customer cash balance.
    "acss_debit",
    "crypto",
    "customer_balance",
    // Local-currency methods that Adaptive Pricing (also a connected-account
    // Dashboard setting) can unlock for a payer outside the US, even though
    // the session itself is priced in USD.
    "bacs_debit",
    "bancontact",
    "bizum",
    "blik",
    "eps",
    "ideal",
    "kakao_pay",
    "kr_card",
    "mb_way",
    "naver_pay",
    "p24",
    "pay_by_bank",
    "payco",
    "pix",
    "samsung_pay",
    "satispay",
    "sepa_debit",
    "twint",
    "upi",
  ];

/**
 * Version of the Checkout Session create params, appended to the idempotency
 * key the checkout route sends (`inv-{id}-bal-{cents}-{bucket}-{version}`).
 * Stripe answers a reused key whose params differ with an idempotency_error,
 * so without it a deploy that changes what Checkout is asked for would
 * collide, for the rest of the current 30-minute bucket, with keys the
 * previous code already minted. ("pm1" = the first versioned params, the ones
 * that added EXCLUDED_PAYMENT_METHOD_TYPES; older keys had no suffix.)
 *
 * Bump when the session create params change.
 */
export const CHECKOUT_PARAMS_VERSION = "pm1";

export function buildCheckoutParams(input: {
  invoiceNumber: number;
  balanceDueCents: number;
  orgId: string;
  invoiceId: number;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds. Caps the stale-session window (see the route). */
  expiresAt: number;
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
    // Card + ACH (+ Link) only — see EXCLUDED_PAYMENT_METHOD_TYPES. Never set
    // payment_method_types. Copied so the shared constant can't be mutated.
    excluded_payment_method_types: [...EXCLUDED_PAYMENT_METHOD_TYPES],
    // Cap the stale-session window. The invoice balance can change (a manual
    // payment, a void) while a Checkout session sits open, and a completed
    // stale session records its full amount_total — double-collecting. Stripe's
    // default expiry is 24h; the route derives a bucket-aligned value so it
    // stays constant across identical re-clicks (idempotency replay).
    expires_at: input.expiresAt,
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

/**
 * True for anything the Stripe SDK throws: API, authentication, permission,
 * rate-limit, idempotency and connection errors alike.
 */
export function isStripeError(err: unknown): err is Stripe.errors.StripeError {
  return err instanceof Stripe.errors.StripeError;
}

/**
 * One-line summary of a Stripe SDK error for the server log: error class,
 * Stripe's code, HTTP status, request id (look it up in the Dashboard's
 * request logs, or quote it to Stripe support), the offending param, the
 * network cause of a connection error, and Stripe's message — which names a
 * missing restricted-key permission but only ever shows the key redacted.
 * Deliberately not the raw error object, whose `raw` / `headers` carry the
 * whole response.
 */
export function describeStripeError(err: Stripe.errors.StripeError): string {
  const { detail } = err;
  const cause =
    typeof detail === "string"
      ? detail
      : detail instanceof Error
        ? detail.message
        : detail?.code;
  const fields = [
    err.type,
    err.code && `code=${err.code}`,
    err.statusCode && `status=${err.statusCode}`,
    err.requestId && `requestId=${err.requestId}`,
    err.param && `param=${err.param}`,
    cause && `cause=${cause}`,
  ].filter(Boolean);
  return `${fields.join(" ")}: ${err.message}`;
}
