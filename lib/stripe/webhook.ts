import type Stripe from "stripe";
import { StripeWebhookInvalidError } from "@/lib/api/errors";
import { round2 } from "@/lib/money";
import { getStripe } from "./client";

export interface WebhookDeps {
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
  /**
   * Resolve the org that owns a connected account. The webhook endpoint is
   * shared by every connected account and signed with the one platform secret,
   * so `event.account` is the ONLY trustworthy owner — `metadata.orgId` is
   * attacker-controllable. Returns null when no org owns the account.
   */
  orgIdForAccount(accountId: string): Promise<string | null>;
  record(input: {
    paymentIntentId: string;
    chargeId: string;
    orgId: string;
    invoiceId: number;
    amount: number;
    feeAmount: number | null;
    netAmount: number | null;
  }): Promise<{ recorded: boolean }>;
  /** Log a failed async (bank-debit) payment on the invoice's event trail. */
  recordFailure(input: {
    orgId: string;
    invoiceId: number;
    amount: number;
    paymentIntentId: string | null;
  }): Promise<void>;
  /** Fetch the charge + balance-transaction fee/net for a payment intent (on the connected account). */
  retrieveCharge(
    accountId: string,
    paymentIntentId: string
  ): Promise<{
    id: string | null;
    balanceFee: number | null;
    balanceNet: number | null;
  }>;
}

/** Verify signature → typed event. Throws StripeWebhookInvalidError on mismatch. */
export function constructStripeEvent(
  payload: string,
  signature: string | null,
  secret: string
): Stripe.Event {
  if (!signature) throw new StripeWebhookInvalidError();
  try {
    return getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new StripeWebhookInvalidError();
  }
}

/** Session events that can carry money. completed fires for every finished
 * Checkout — including async bank debits whose funds haven't settled — so it
 * must be gated on payment_status. async_payment_succeeded is the settlement
 * signal for those (payment_intent.succeeded also covers it as a backstop). */
const PAYING_SESSION_EVENTS = new Set<string>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<void> {
  if (await deps.isProcessed(event.id)) return;

  if (
    PAYING_SESSION_EVENTS.has(event.type) ||
    event.type === "payment_intent.succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const accountId = (event as { account?: string }).account ?? "";
    const obj = event.data.object as unknown as Record<string, unknown>;
    const paymentIntentId =
      typeof obj.payment_intent === "string"
        ? obj.payment_intent
        : typeof obj.id === "string" &&
            event.type === "payment_intent.succeeded"
          ? obj.id
          : "";
    const metadata = (obj.metadata ?? {}) as Record<string, string>;
    const invoiceId = Number(metadata.invoiceId);
    // Authoritative org from the signed event.account — NOT metadata.orgId,
    // which any connected account could forge to point at a victim org.
    const orgId = accountId ? await deps.orgIdForAccount(accountId) : null;
    const amountTotal =
      typeof obj.amount_total === "number"
        ? obj.amount_total
        : typeof obj.amount === "number"
          ? (obj.amount as number)
          : 0;

    if (event.type === "checkout.session.async_payment_failed") {
      // A bank debit bounced. No money moved and nothing was recorded (the
      // completed event was unpaid-gated below), so there is no ledger row to
      // touch — just leave an audit trail on the invoice.
      if (invoiceId && orgId) {
        await deps.recordFailure({
          orgId,
          invoiceId,
          amount: round2(amountTotal / 100),
          paymentIntentId: paymentIntentId || null,
        });
      }
      await deps.markProcessed(event.id, event.type);
      return;
    }

    // A completed session is only money in hand when payment_status is "paid".
    // Async methods (ACH debit) complete "unpaid" and settle days later via
    // async_payment_succeeded / payment_intent.succeeded — recording them here
    // would mark the invoice paid before the funds exist.
    const sessionPaid =
      event.type === "payment_intent.succeeded" ||
      obj.payment_status === "paid";

    if (
      sessionPaid &&
      paymentIntentId &&
      invoiceId &&
      orgId &&
      amountTotal > 0
    ) {
      const charge = await deps.retrieveCharge(accountId, paymentIntentId);
      // Require a real charge id. Both the webhook and the reconcile-on-return
      // path key idempotency on it; a synthetic fallback would let the two paths
      // record the same charge twice. If the charge isn't attached yet, throw so
      // the caller returns 500 and Stripe redelivers once it lands.
      if (!charge.id) {
        throw new Error("Stripe charge not yet attached; will retry");
      }
      await deps.record({
        paymentIntentId,
        chargeId: charge.id,
        orgId,
        invoiceId,
        amount: round2(amountTotal / 100),
        feeAmount: charge.balanceFee,
        netAmount: charge.balanceNet,
      });
    }
  }

  await deps.markProcessed(event.id, event.type);
}
