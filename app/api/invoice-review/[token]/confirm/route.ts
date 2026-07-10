import { z } from "zod";
import { NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { round2 } from "@/lib/money";
import {
  getInvoiceByToken,
  recordStripePayment,
} from "@/lib/repositories/invoiceRepo";
import { getOrgStripe } from "@/lib/repositories/orgRepo";
import { getStripe } from "@/lib/stripe/client";

const Body = z.object({ sessionId: z.string().min(1).max(200) });

export const POST = publicRoute<{ sessionId: string }, { token: string }>(
  { input: Body },
  async ({ input, params }) => {
    const invoice = await getInvoiceByToken(params.token);
    if (!invoice || invoice.status === "void") throw new NotFoundError();
    const org = await getOrgStripe(invoice.orgId);
    if (!org.stripeConnectAccountId) throw new NotFoundError();

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(
      input.sessionId,
      { expand: ["payment_intent.latest_charge.balance_transaction"] },
      { stripeAccount: org.stripeConnectAccountId }
    );
    // Bind the session to THIS invoice. The session's metadata.invoiceId is set
    // by us at checkout creation; requiring it to match the token's invoice stops
    // a caller from applying a different invoice's session to this one (the unique
    // chargeId blocks a second write, but this rejects the mismatch up front).
    if (session.metadata?.invoiceId !== String(invoice.id)) {
      throw new NotFoundError();
    }
    const pi = session.payment_intent as {
      id: string;
      status?: string;
      latest_charge?: {
        id: string;
        balance_transaction?: { fee: number; net: number } | null;
      } | null;
    } | null;

    if (session.payment_status !== "paid") {
      // A failed async debit (ACH bounce) leaves the session "complete"/"unpaid"
      // indefinitely — the bounce lives only on the PaymentIntent, which flips to
      // requires_payment_method / canceled. Surface it as "failed" so the UI stops
      // telling the homeowner their bank payment is still "processing" forever.
      if (
        pi?.status === "requires_payment_method" ||
        pi?.status === "canceled"
      ) {
        return { status: "failed" };
      }
      // A complete-but-unpaid session is an async bank debit in flight: the
      // customer finished Checkout but settlement takes days. Distinguish it
      // so the UI can show honest "processing" copy; the invoice is recorded
      // later by the async_payment_succeeded / payment_intent.succeeded webhook.
      return {
        status: session.status === "complete" ? "processing" : "pending",
      };
    }

    const charge = pi?.latest_charge ?? null;
    // Require a real charge id (and its parent PI). Without it, this reconcile
    // path and the webhook would key idempotency on different strings (a synthetic
    // pi_-id here vs the real ch_-id there) and record the same charge twice.
    // Defer to the webhook.
    if (!pi?.id || !charge?.id) return { status: "pending" };
    const bt = charge.balance_transaction ?? null;
    const { overpaid } = await recordStripePayment({
      paymentIntentId: pi.id,
      chargeId: charge.id,
      orgId: invoice.orgId,
      invoiceId: invoice.id,
      amount: round2((session.amount_total ?? 0) / 100),
      feeAmount: bt ? bt.fee / 100 : null,
      netAmount: bt ? bt.net / 100 : null,
    });
    // A stale session completed after the balance was already covered: the money
    // is recorded and flagged for refund, but the customer must not see a plain
    // "Payment received" — tell them the difference will be refunded.
    return { status: overpaid ? "overpaid" : "paid" };
  }
);
