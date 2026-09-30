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
  /**
   * Persist captured money we can't attribute to an invoice (unknown account or
   * missing/invalid invoiceId metadata). Redelivery can't fix bad metadata, so
   * the handler still 200s — but the money is real and must never be dropped
   * silently (CONTEXT.md invariant 3), so a human can find it later.
   */
  recordAnomaly(input: {
    eventId: string;
    eventType: string;
    accountId: string | null;
    paymentIntentId: string | null;
    amount: number;
    reason: "unknown_account" | "missing_invoice_metadata";
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

const ASYNC_PAYMENT_FAILED = "checkout.session.async_payment_failed";
const PAYMENT_INTENT_SUCCEEDED = "payment_intent.succeeded";

/** Every event type this handler acts on; anything else is a no-op. */
function isHandledEvent(type: string): boolean {
  return (
    PAYING_SESSION_EVENTS.has(type) ||
    type === PAYMENT_INTENT_SUCCEEDED ||
    type === ASYNC_PAYMENT_FAILED
  );
}

/** The fields every branch below needs, resolved once from the raw event so
 * each handler works with already-resolved values instead of re-deriving
 * them from `Stripe.Event` narrowing. */
interface EventFields {
  accountId: string;
  paymentIntentId: string;
  invoiceId: number;
  /** Authoritative org from the signed event.account — NOT metadata.orgId,
   * which any connected account could forge to point at a victim org. */
  orgId: string | null;
  amountTotal: number;
  /** A completed session is only money in hand when payment_status is "paid".
   * Async methods (ACH debit) complete "unpaid" and settle days later via
   * async_payment_succeeded / payment_intent.succeeded — recording them here
   * would mark the invoice paid before the funds exist. A payment_intent
   * event has no payment_status field at all, so it's paid by definition. */
  sessionPaid: boolean;
}

async function deriveEventFields(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<EventFields> {
  const accountId = (event as { account?: string }).account ?? "";
  const obj = event.data.object as unknown as Record<string, unknown>;
  const paymentIntentId =
    typeof obj.payment_intent === "string"
      ? obj.payment_intent
      : typeof obj.id === "string" && event.type === PAYMENT_INTENT_SUCCEEDED
        ? obj.id
        : "";
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  const invoiceId = Number(metadata.invoiceId);
  const orgId = accountId ? await deps.orgIdForAccount(accountId) : null;
  const amountTotal =
    typeof obj.amount_total === "number"
      ? obj.amount_total
      : typeof obj.amount === "number"
        ? (obj.amount as number)
        : 0;
  const sessionPaid =
    event.type === PAYMENT_INTENT_SUCCEEDED || obj.payment_status === "paid";

  return {
    accountId,
    paymentIntentId,
    invoiceId,
    orgId,
    amountTotal,
    sessionPaid,
  };
}

/** A bank debit bounced. No money moved and nothing was recorded (the
 * completed event was unpaid-gated), so there is no ledger row to touch —
 * just leave an audit trail on the invoice. */
async function recordFailure(fields: EventFields, deps: WebhookDeps) {
  if (!(fields.invoiceId && fields.orgId)) return;
  await deps.recordFailure({
    orgId: fields.orgId,
    invoiceId: fields.invoiceId,
    amount: round2(fields.amountTotal / 100),
    paymentIntentId: fields.paymentIntentId || null,
  });
}

/** Money is confirmed and attributable to an invoice — record it. */
async function recordSettlement(fields: EventFields, deps: WebhookDeps) {
  // fields.orgId is non-null here (checked by the caller's guard).
  const orgId = fields.orgId as string;
  const charge = await deps.retrieveCharge(
    fields.accountId,
    fields.paymentIntentId
  );
  // Require a real charge id. Both the webhook and the reconcile-on-return
  // path key idempotency on it; a synthetic fallback would let the two paths
  // record the same charge twice. If the charge isn't attached yet, throw so
  // the caller returns 500 and Stripe redelivers once it lands.
  if (!charge.id) {
    throw new Error("Stripe charge not yet attached; will retry");
  }
  await deps.record({
    paymentIntentId: fields.paymentIntentId,
    chargeId: charge.id,
    orgId,
    invoiceId: fields.invoiceId,
    amount: round2(fields.amountTotal / 100),
    feeAmount: charge.balanceFee,
    netAmount: charge.balanceNet,
  });
}

/** Money moved but we can't book it: either no org owns event.account, or
 * the invoiceId metadata is missing/non-numeric. Throwing wouldn't help —
 * redelivery re-sends the same bad metadata — so record a queryable anomaly
 * and let the event be marked processed. CONTEXT.md invariant 3: a captured
 * charge is never silently dropped. */
async function recordAnomaly(
  event: Stripe.Event,
  fields: EventFields,
  deps: WebhookDeps
) {
  await deps.recordAnomaly({
    eventId: event.id,
    eventType: event.type,
    accountId: fields.accountId || null,
    paymentIntentId: fields.paymentIntentId,
    amount: round2(fields.amountTotal / 100),
    reason: fields.orgId ? "missing_invoice_metadata" : "unknown_account",
  });
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<void> {
  if (await deps.isProcessed(event.id)) return;

  if (isHandledEvent(event.type)) {
    const fields = await deriveEventFields(event, deps);

    if (event.type === ASYNC_PAYMENT_FAILED) {
      await recordFailure(fields, deps);
    } else if (
      fields.sessionPaid &&
      fields.paymentIntentId &&
      fields.invoiceId &&
      fields.orgId &&
      fields.amountTotal > 0
    ) {
      await recordSettlement(fields, deps);
    } else if (
      fields.sessionPaid &&
      fields.paymentIntentId &&
      fields.amountTotal > 0
    ) {
      await recordAnomaly(event, fields, deps);
    }
  }

  await deps.markProcessed(event.id, event.type);
}
