import type Stripe from "stripe";
import { logError } from "@/lib/logger";
import { realGateway } from "@/lib/stripe/realGateway";
import {
  buildProdWebhookDeps,
  handleStripeEvent,
} from "@/lib/stripe/webhookHandler";

// Prisma needs Node; also required for raw-body signature verification.
export const runtime = "nodejs";

/**
 * BARE handler — intentionally NOT wrapped in apiRoute/publicRoute, which call
 * req.json() and would consume the raw body needed for signature verification.
 * The Stripe signature is the credential (route is allowlisted in
 * lib/publicRoutes.ts). Returns 200 on success + idempotent replays, 400 on a
 * bad signature so Stripe stops retrying a malformed body.
 */
export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = realGateway.constructWebhookEvent(rawBody, signature);
  } catch (err) {
    logError({
      errorMessage: "STRIPE_WEBHOOK_SIGNATURE_FAILED",
      err,
      method: "POST",
      path: "/api/stripe/webhook",
      orgId: "stripe-webhook",
    });
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event, buildProdWebhookDeps());
  } catch (err) {
    // The event is verified-genuine; a transient failure should be retried by
    // Stripe via a non-2xx. Idempotency on stripeChargeId makes retries safe.
    logError({
      errorMessage: `stripe webhook handler failed: ${event.type}`,
      err,
      method: "POST",
      path: "/api/stripe/webhook",
      orgId: "stripe-webhook",
    });
    return new Response("Handler error", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
