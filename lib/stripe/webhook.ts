import type Stripe from "stripe";
import { StripeWebhookInvalidError } from "@/lib/api/errors";
import { round2 } from "@/lib/money";
import { getStripe } from "./client";

export interface WebhookDeps {
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
  record(input: {
    paymentIntentId: string;
    chargeId: string;
    orgId: string;
    invoiceId: number;
    amount: number;
    feeAmount: number | null;
    netAmount: number | null;
  }): Promise<{ recorded: boolean }>;
  /** Fetch the charge + balance-transaction fee/net for a payment intent (on the connected account). */
  retrieveCharge(
    accountId: string,
    paymentIntentId: string
  ): Promise<{
    id: string;
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

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<void> {
  if (await deps.isProcessed(event.id)) return;

  if (
    event.type === "checkout.session.completed" ||
    event.type === "payment_intent.succeeded"
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
    const orgId = metadata.orgId ?? "";
    const amountTotal =
      typeof obj.amount_total === "number"
        ? obj.amount_total
        : typeof obj.amount === "number"
          ? (obj.amount as number)
          : 0;

    if (paymentIntentId && invoiceId && orgId && amountTotal > 0) {
      const charge = await deps.retrieveCharge(accountId, paymentIntentId);
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
