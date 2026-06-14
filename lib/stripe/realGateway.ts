import type Stripe from "stripe";
import { StripeOnboardingError } from "@/lib/api/errors";
import { getStripeClient } from "./client";
import type { CreatedCheckoutSession, StripeGateway } from "./gateway";

function client(): Stripe {
  const c = getStripeClient();
  if (!c) throw new StripeOnboardingError("Stripe is not configured");
  return c;
}

function asId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

export const realGateway: StripeGateway = {
  async createConnectAccount(orgId) {
    const account = await client().accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
        requirement_collection: "stripe",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { orgId },
    });
    return { id: account.id };
  },

  async createAccountLink(accountId, urls) {
    const link = await client().accountLinks.create({
      account: accountId,
      refresh_url: urls.refreshUrl,
      return_url: urls.returnUrl,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
    });
    return { url: link.url };
  },

  async createCheckoutSession(params): Promise<CreatedCheckoutSession> {
    const s = await client().checkout.sessions.create(params);
    return { id: s.id, url: s.url, paymentIntentId: asId(s.payment_intent) };
  },

  async retrievePaymentIntent(id) {
    return client().paymentIntents.retrieve(id, { expand: ["latest_charge"] });
  },

  constructWebhookEvent(rawBody, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret)
      throw new StripeOnboardingError("Webhook secret not configured");
    return client().webhooks.constructEvent(rawBody, signature ?? "", secret);
  },
};
