import {
  InvoiceAlreadyPaidError,
  NotFoundError,
  StripeAccountRestrictedError,
  StripeNotConnectedError,
} from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { round2 } from "@/lib/money";
import { getInvoiceByToken } from "@/lib/repositories/invoiceRepo";
import { getOrgStripe, setOrgConnectStatus } from "@/lib/repositories/orgRepo";
import {
  buildCheckoutParams,
  createInvoiceCheckoutSession,
} from "@/lib/stripe/checkout";
import { type ConnectStatus, readAccountStatus } from "@/lib/stripe/connect";

function baseUrl(req: Request): string {
  return (
    process.env.STRIPE_PUBLIC_BASE_URL ?? new URL(req.url).origin
  ).replace(/\/$/, "");
}

export const POST = publicRoute<undefined, { token: string }>(
  async ({ req, params }) => {
    const invoice = await getInvoiceByToken(params.token);
    if (!invoice || invoice.status === "void") throw new NotFoundError();
    if (invoice.status === "paid") throw new InvoiceAlreadyPaidError();

    const org = await getOrgStripe(invoice.orgId);
    if (!org.stripeConnectAccountId) throw new StripeNotConnectedError();
    // Re-check capability live; cache the result.
    let status = org.stripeConnectStatus as ConnectStatus | null;
    if (status !== "active") {
      status = await readAccountStatus(org.stripeConnectAccountId);
      await setOrgConnectStatus(invoice.orgId, status);
    }
    if (status !== "active") throw new StripeAccountRestrictedError();

    const paid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
    const balanceDue = round2(invoice.amount - paid);
    if (balanceDue <= 0) throw new InvoiceAlreadyPaidError();
    const balanceDueCents = Math.round(balanceDue * 100);

    const base = baseUrl(req);
    const ret = `${base}/invoice-review/${params.token}`;
    const checkoutParams = buildCheckoutParams({
      invoiceNumber: invoice.invoiceNumber,
      balanceDueCents,
      orgId: invoice.orgId,
      invoiceId: invoice.id,
      successUrl: `${ret}?pay=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${ret}?pay=cancelled`,
    });

    // Idempotency keyed on invoice + current balance: identical re-clicks reuse
    // the same session; a changed balance mints a new one.
    const { url } = await createInvoiceCheckoutSession(
      org.stripeConnectAccountId,
      checkoutParams,
      `inv-${invoice.id}-bal-${balanceDueCents}`
    );
    return { url };
  }
);
