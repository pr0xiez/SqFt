import {
  ConflictError,
  EmailFailedError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { sendQuoteEmail } from "@/lib/email/sendQuoteEmail";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { quoteIdParams, quoteSendSchema } from "@/lib/quotes/schema";
import { computeQuoteView, fromPrismaQuote } from "@/lib/quoteView";
import {
  getQuote,
  markQuoteSent,
  rotateApprovalToken,
  writeQuoteEvent,
} from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const POST = apiRoute(
  { input: quoteSendSchema },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const sender = session.user;
    if (!sender?.email || !sender?.name) throw new UnauthorizedError();

    const { id: quoteId } = quoteIdParams.parse(params);
    const { to, subject, message, regenerateLink } = input;

    const quote = await getQuote(quoteId, orgId);
    if (!quote) throw new NotFoundError();
    if (quote.status === "accepted" || quote.status === "declined") {
      throw new ConflictError(`Cannot re-send a ${quote.status} quote`);
    }

    let token = quote.approvalToken;
    if (regenerateLink || !token) {
      token = await rotateApprovalToken(quoteId, orgId);
      if (!token) throw new NotFoundError();
      await writeQuoteEvent({
        quoteId,
        type: "link_rotated",
        actorEmail: sender.email,
        actorName: sender.name,
      });
    }

    const publicUrl = `${getPublicBaseUrl()}/q/${token}`;
    const total =
      quote.lineItems.length === 0
        ? 0
        : computeQuoteView(fromPrismaQuote(quote)).total;
    const org = await getOrgForEmail(orgId);

    const sendResult = await sendQuoteEmail({
      to,
      subject,
      message,
      publicUrl,
      customerName: quote.estimate.customer?.name ?? "there",
      org: { name: org.name, phone: org.phone, logo: org.logo },
      quoteNumber: quote.quoteNumber,
      totalDollars: total,
      replyTo: sender.email,
    });

    if (!sendResult.ok) {
      throw new EmailFailedError(sendResult.error ?? "Email failed");
    }

    const marked = await markQuoteSent(quoteId, orgId, {
      to,
      subject,
      sentByEmail: sender.email,
      sentByName: sender.name,
    });
    if (!marked) throw new NotFoundError();

    if (quote.estimate.customer && quote.estimate.customer.email !== to) {
      void updateCustomerEmail(quote.estimate.customer.id, orgId, to);
    }

    return { ok: true };
  }
);

async function getOrgForEmail(orgId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, phone: true, logo: true },
  });
}

async function updateCustomerEmail(
  customerId: number,
  orgId: string,
  email: string
) {
  try {
    await prisma.customer.updateMany({
      where: { id: customerId, orgId },
      data: { email },
    });
  } catch (err) {
    logError({ errorMessage: "Failed to save customer email", err });
  }
}
