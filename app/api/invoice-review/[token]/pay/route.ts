import {
  InvoiceAlreadyPaidError,
  NotFoundError,
  StripeNotConnectedError,
  StripeOnboardingError,
} from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { invoiceTokenParams } from "@/lib/invoices/schema";
import {
  getInvoicePayContext,
  setInvoicePaymentIntent,
} from "@/lib/repositories";
import { buildCheckoutSessionParams } from "@/lib/stripe/checkout";
import { realGateway } from "@/lib/stripe/realGateway";

export const GET = publicRoute(async ({ params }) => {
  const { token } = invoiceTokenParams.parse(params);
  const ctx = await getInvoicePayContext(token);
  if (!ctx) throw new NotFoundError();
  if (!ctx.chargesEnabled || !ctx.connectAccountId) {
    throw new StripeNotConnectedError();
  }
  if (
    ctx.balanceDueCents <= 0 ||
    ctx.status === "paid" ||
    ctx.status === "void"
  ) {
    throw new InvoiceAlreadyPaidError();
  }

  const base = getPublicBaseUrl();
  const session = await realGateway.createCheckoutSession(
    buildCheckoutSessionParams({
      invoiceId: ctx.invoiceId,
      orgId: ctx.orgId,
      connectAccountId: ctx.connectAccountId,
      amountCents: ctx.balanceDueCents,
      invoiceNumber: ctx.invoiceNumber,
      customerEmail: ctx.customerEmail,
      successUrl: `${base}/invoice-review/${token}?paid=1`,
      cancelUrl: `${base}/invoice-review/${token}`,
    })
  );
  if (!session.url) throw new StripeOnboardingError("No checkout URL returned");
  if (session.paymentIntentId) {
    await setInvoicePaymentIntent(
      ctx.invoiceId,
      ctx.orgId,
      session.paymentIntentId
    );
  }
  return Response.redirect(session.url, 303);
});
