import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  recordStripeAnomaly,
  recordStripePayment,
  recordStripePaymentFailure,
} from "@/lib/repositories/invoiceRepo";
import { getOrgIdByConnectAccount } from "@/lib/repositories/orgRepo";
import { getStripe } from "@/lib/stripe/client";
import { constructStripeEvent, handleStripeEvent } from "@/lib/stripe/webhook";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });

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
      record: (input) => recordStripePayment(input),
      recordFailure: (input) => recordStripePaymentFailure(input),
      recordAnomaly: (input) => recordStripeAnomaly(input),
      retrieveCharge: async (accountId, paymentIntentId) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(
          paymentIntentId,
          { expand: ["latest_charge.balance_transaction"] },
          { stripeAccount: accountId }
        );
        const charge = pi.latest_charge as {
          id: string;
          balance_transaction?: { fee: number; net: number } | null;
        } | null;
        const bt = charge?.balance_transaction ?? null;
        return {
          // No synthetic fallback: a missing charge id makes the handler throw
          // so Stripe redelivers once the charge is attached (see webhook.ts).
          id: charge?.id ?? null,
          balanceFee: bt ? bt.fee / 100 : null,
          balanceNet: bt ? bt.net / 100 : null,
        };
      },
    });
  } catch (_err) {
    // Returning 500 makes Stripe retry — acceptable since handling is idempotent.
    return new NextResponse("handler error", { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
