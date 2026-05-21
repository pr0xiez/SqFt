import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { sendSignedNotification } from "@/lib/email/sendSignedNotification";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { quoteDeclineSchema, quoteTokenParams } from "@/lib/quotes/schema";
import { declineQuoteByToken, getQuoteByToken } from "@/lib/repositories";

export const POST = publicRoute(
  { input: quoteDeclineSchema },
  async ({ req, input, params }) => {
    const { token } = quoteTokenParams.parse(params);

    const quote = await getQuoteByToken(token);
    if (!quote) throw new NotFoundError();
    if (quote.status === "accepted" || quote.status === "declined") {
      throw new ConflictError(`Quote already ${quote.status}`);
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const result = await declineQuoteByToken(quote.id, {
      reason: input.reason ?? null,
      ip,
      userAgent,
    });
    if (result === "not_found") throw new NotFoundError();
    if (result !== "ok") {
      throw new ConflictError(
        `Quote already ${result.replace("already_", "")}`
      );
    }

    void notifyDeclined(quote.orgId, {
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      customerName: quote.estimate.customer?.name ?? "Customer",
      customerEmail: quote.estimate.customer?.email ?? null,
      reason: input.reason,
    });

    return { ok: true };
  }
);

async function notifyDeclined(
  orgId: string,
  args: {
    quoteId: number;
    quoteNumber: number;
    customerName: string;
    customerEmail: string | null;
    reason?: string;
  }
) {
  try {
    const owners = await prisma.user.findMany({
      where: { orgId, role: "owner" },
      select: { email: true },
    });
    await sendSignedNotification({
      variant: "declined",
      to: owners.map((o) => o.email).filter(Boolean),
      quoteId: args.quoteId,
      quoteNumber: args.quoteNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      signedAt: new Date(),
      total: 0,
      deposit: 0,
      declineReason: args.reason,
    });
  } catch (err) {
    logError({ errorMessage: "Decline notification failed", err });
  }
}
