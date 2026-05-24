import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
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

    return { ok: true };
  }
);
