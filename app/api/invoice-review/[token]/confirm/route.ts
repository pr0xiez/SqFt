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
    if (session.payment_status !== "paid") return { status: "pending" };

    const pi = session.payment_intent as {
      id: string;
      latest_charge?: {
        id: string;
        balance_transaction?: { fee: number; net: number } | null;
      } | null;
    };
    const charge = pi.latest_charge ?? null;
    const bt = charge?.balance_transaction ?? null;
    await recordStripePayment({
      paymentIntentId: pi.id,
      chargeId: charge?.id ?? `pi_${pi.id}`,
      orgId: invoice.orgId,
      invoiceId: invoice.id,
      amount: round2((session.amount_total ?? 0) / 100),
      feeAmount: bt ? bt.fee / 100 : null,
      netAmount: bt ? bt.net / 100 : null,
    });
    return { status: "paid" };
  }
);
