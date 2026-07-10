import {
  InvoiceAlreadyPaidError,
  NotFoundError,
  StripeAccountRestrictedError,
  StripeNotConnectedError,
} from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { round2 } from "@/lib/money";
import { getInvoiceByToken } from "@/lib/repositories/invoiceRepo";
import { getOrgStripe, setOrgConnectStatus } from "@/lib/repositories/orgRepo";
import {
  buildCheckoutParams,
  createInvoiceCheckoutSession,
} from "@/lib/stripe/checkout";
import { type ConnectStatus, readAccountStatus } from "@/lib/stripe/connect";

export const POST = publicRoute<undefined, { token: string }>(
  async ({ params }) => {
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

    // 30-minute buckets tie the idempotency key and the session's expires_at
    // together. Within a bucket, re-clicks produce byte-identical create params
    // so Stripe replays the same session (no idempotency_error, no stale null-url
    // replay); a new bucket — or a changed balance — mints a fresh session and
    // lets any token-rotation param conflict age out. expires_at sits 3 buckets
    // ahead: constant per bucket, always 60–90 min out (above Stripe's 30-min
    // minimum, well under the 24h max) even after request latency.
    const BUCKET_SEC = 30 * 60;
    const bucket = Math.floor(Date.now() / 1000 / BUCKET_SEC);
    const expiresAt = (bucket + 3) * BUCKET_SEC;

    const ret = `${getPublicBaseUrl()}/invoice-review/${params.token}`;
    const checkoutParams = buildCheckoutParams({
      invoiceNumber: invoice.invoiceNumber,
      balanceDueCents,
      orgId: invoice.orgId,
      invoiceId: invoice.id,
      successUrl: `${ret}?pay=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${ret}?pay=cancelled`,
      expiresAt,
    });

    try {
      const { url } = await createInvoiceCheckoutSession(
        org.stripeConnectAccountId,
        checkoutParams,
        `inv-${invoice.id}-bal-${balanceDueCents}-${bucket}`
      );
      return { url };
    } catch (err) {
      // The cached status was "active", so we skipped the live re-check — but a
      // create failure may mean Stripe has since restricted the account. Verify
      // live: if it's no longer active, downgrade the cache and return the
      // documented STRIPE_ACCOUNT_RESTRICTED instead of a generic 500.
      const live = await readAccountStatus(org.stripeConnectAccountId);
      if (live !== "active") {
        await setOrgConnectStatus(invoice.orgId, live);
        throw new StripeAccountRestrictedError();
      }
      throw err;
    }
  }
);
