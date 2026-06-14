import type Stripe from "stripe";
import type { RecordStripePaymentInput } from "@/lib/repositories/invoiceRepo";
import type { StripeGateway } from "./gateway";

export interface PaymentContext {
  invoiceId: number;
  orgId: string;
  orgConnectAccountId: string | null;
}

export interface StripeWebhookDeps {
  gateway: Pick<StripeGateway, "retrievePaymentIntent">;
  recordStripePayment: (
    invoiceId: number,
    orgId: string,
    input: RecordStripePaymentInput
  ) => Promise<"recorded" | "duplicate" | "not_found">;
  resolvePaymentContext: (
    metadataInvoiceId: number
  ) => Promise<PaymentContext | null>;
  appendInvoiceEvent: (input: {
    invoiceId: number;
    type: string;
    source: "customer" | "system" | "builder";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  mirrorAccountStatus: (account: Stripe.Account) => Promise<void>;
}

function asId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "id" in (v as object)) {
    return (v as { id: string }).id;
  }
  return null;
}

function intFromMeta(meta: unknown): number | null {
  const raw = (meta as { invoiceId?: string } | null)?.invoiceId;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Record a settled PaymentIntent into the ledger (idempotent downstream). */
async function recordFromPaymentIntentId(
  piId: string,
  eventId: string,
  deps: StripeWebhookDeps
): Promise<void> {
  const pi = await deps.gateway.retrievePaymentIntent(piId);
  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object"
      ? (pi.latest_charge as Stripe.Charge)
      : null;
  const chargeId = charge?.id ?? asId(pi.latest_charge);
  const metadataInvoiceId = intFromMeta(pi.metadata);
  const destination = asId(pi.transfer_data?.destination ?? null);
  if (!chargeId || metadataInvoiceId === null) return;

  const ctx = await deps.resolvePaymentContext(metadataInvoiceId);
  if (!ctx) return;

  if (
    destination &&
    ctx.orgConnectAccountId &&
    destination !== ctx.orgConnectAccountId
  ) {
    await deps.appendInvoiceEvent({
      invoiceId: ctx.invoiceId,
      type: "stripe_org_mismatch",
      source: "system",
      metadata: { paymentIntentId: pi.id, destination, eventId },
    });
    return;
  }

  const method: "ach" | "card" =
    charge?.payment_method_details?.type === "us_bank_account" ? "ach" : "card";
  const amount = (pi.amount_received ?? pi.amount ?? 0) / 100;

  await deps.recordStripePayment(ctx.invoiceId, ctx.orgId, {
    amount,
    method,
    stripeChargeId: chargeId,
    stripePaymentIntentId: pi.id,
    paidAt: new Date(),
    stripeEventId: eventId,
  });
}

async function markByMetadata(
  metadata: unknown,
  type: string,
  source: "customer" | "system",
  eventId: string,
  deps: StripeWebhookDeps
): Promise<void> {
  const invoiceId = intFromMeta(metadata);
  if (invoiceId === null) return;
  const ctx = await deps.resolvePaymentContext(invoiceId);
  if (!ctx) return;
  await deps.appendInvoiceEvent({
    invoiceId: ctx.invoiceId,
    type,
    source,
    metadata: { eventId },
  });
}

/**
 * Dispatch a verified Stripe event. Records a Payment ONLY on terminal success
 * (cards: completed+paid; ACH: async_payment_succeeded / payment_intent.succeeded).
 * In-flight ACH and failures only write InvoiceEvent markers — the ledger means
 * settled money only. Never throws on unknown events.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  deps: StripeWebhookDeps
): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await recordFromPaymentIntentId(pi.id, event.id, deps);
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const piId = asId(s.payment_intent);
      if (piId) await recordFromPaymentIntentId(piId, event.id, deps);
      break;
    }
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const piId = asId(s.payment_intent);
      if (s.payment_status === "paid" && piId) {
        await recordFromPaymentIntentId(piId, event.id, deps);
      } else {
        await markByMetadata(
          s.metadata,
          "ach_processing",
          "customer",
          event.id,
          deps
        );
      }
      break;
    }
    case "payment_intent.processing": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await markByMetadata(
        pi.metadata,
        "ach_processing",
        "customer",
        event.id,
        deps
      );
      break;
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      await markByMetadata(s.metadata, "ach_failed", "system", event.id, deps);
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await markByMetadata(
        pi.metadata,
        "payment_failed",
        "system",
        event.id,
        deps
      );
      break;
    }
    case "account.updated": {
      await deps.mirrorAccountStatus(event.data.object as Stripe.Account);
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      // Out of scope this round: audit-log only, no ledger reversal.
      const ch = event.data.object as Stripe.Charge;
      const invoiceId = intFromMeta(ch.metadata);
      if (invoiceId !== null) {
        const ctx = await deps.resolvePaymentContext(invoiceId);
        if (ctx) {
          await deps.appendInvoiceEvent({
            invoiceId: ctx.invoiceId,
            type:
              event.type === "charge.refunded"
                ? "stripe_refund"
                : "stripe_dispute",
            source: "system",
            metadata: { chargeId: ch.id, eventId: event.id },
          });
        }
      }
      break;
    }
    default:
      break;
  }
}
