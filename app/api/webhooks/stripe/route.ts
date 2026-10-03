import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import {
  recordStripeAnomaly,
  recordStripePayment,
  recordStripePaymentFailure,
} from "@/lib/repositories/invoiceRepo";
import { getOrgIdByConnectAccount } from "@/lib/repositories/organizationRepo";
import { retrieveChargeFees, retryForBalance } from "@/lib/stripe/chargeFees";
import { getStripe } from "@/lib/stripe/client";
import { constructStripeEvent, handleStripeEvent } from "@/lib/stripe/webhook";

export async function POST(req: Request) {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logError({
      path: "api/webhooks/stripe",
      errorMessage: "Stripe webhook secret is not configured",
    });
    return new NextResponse("not configured", { status: 500 });
  }

  const body = await req.text(); // RAW body — required for signature verification
  const sig = (await headers()).get("stripe-signature");
  let event: ReturnType<typeof constructStripeEvent>;
  try {
    event = constructStripeEvent(body, sig, secret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event, {
      isProcessed: async (id) =>
        Boolean(
          await prisma.processedStripeEvent.findUnique({ where: { id } })
        ),
      markProcessed: async (id, type) => {
        await prisma.processedStripeEvent.create({ data: { id, type } });
      },
      orgIdForAccount: async (accountId) => {
        const orgId = await getOrgIdByConnectAccount(accountId);
        if (!orgId) {
          logError({
            path: "api/webhooks/stripe",
            errorMessage: `No org owns connected account ${accountId}; event skipped`,
          });
        }
        return orgId;
      },
      record: async (input) => {
        const result = await recordStripePayment(input);
        // A card payment is the "did it sync?" moment for the contractor —
        // run the enqueued QBO task now instead of waiting for the sweeper.
        after(() => runQboSyncForOrg(input.orgId));
        return result;
      },
      recordFailure: (input) => recordStripePaymentFailure(input),
      recordAnomaly: (input) => recordStripeAnomaly(input),
      retrieveCharge: async (accountId, paymentIntentId) => {
        // No synthetic fallback: a missing charge id makes the handler throw
        // so Stripe redelivers once the charge is attached (see webhook.ts).
        // A balance transaction that lags its charge is re-read briefly; if
        // it's still missing, the handler records and retries for fee/net.
        const stripe = getStripe();
        const read = () =>
          retrieveChargeFees(stripe, accountId, paymentIntentId);
        return retryForBalance(await read(), read);
      },
    });
  } catch (err) {
    // Returning 500 makes Stripe retry — acceptable since handling is idempotent.
    // Still log here: this route isn't wrapped in apiRoute, so none of the
    // usual wrapHandler/instrumentation logging sees this error otherwise.
    logError({
      path: "api/webhooks/stripe",
      errorMessage: `Stripe event ${event.id} (${event.type}) handling failed`,
      err,
    });
    return new NextResponse("handler error", { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
