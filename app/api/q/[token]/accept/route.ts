import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { quoteAcceptSchema, quoteTokenParams } from "@/lib/quotes/schema";
import { fromPrismaQuote } from "@/lib/quoteView";
import { canonicalize, sha256, snapshotQuote } from "@/lib/quoteView/snapshot";
import { acceptQuoteByToken, getQuoteByToken } from "@/lib/repositories";

const MAX_SIG_BYTES = 100 * 1024;

export const POST = publicRoute(
  { input: quoteAcceptSchema },
  async ({ req, input, params }) => {
    const { token } = quoteTokenParams.parse(params);
    const { name, email, signatureDataUrl, consentText } = input;

    // Decoded length check (base64 → bytes ≈ length × 3/4)
    const b64 = signatureDataUrl.slice("data:image/png;base64,".length);
    if ((b64.length * 3) / 4 > MAX_SIG_BYTES) {
      throw new ValidationError("Signature image too large (>100KB)");
    }

    const quote = await getQuoteByToken(token);
    if (!quote) throw new NotFoundError();
    if (quote.status === "accepted" || quote.status === "declined") {
      throw new ConflictError(`Quote already ${quote.status}`);
    }

    const snap = snapshotQuote(fromPrismaQuote(quote), {
      quoteNumber: quote.quoteNumber,
      date: quote.date,
      customer: quote.estimate.customer
        ? {
            name: quote.estimate.customer.name,
            address: quote.estimate.customer.address,
            email: quote.estimate.customer.email,
            phone: quote.estimate.customer.phone,
          }
        : null,
      org: quote.org,
    });
    const snapshotHash = sha256(canonicalize(snap));

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const result = await acceptQuoteByToken({
      quoteId: quote.id,
      signedByName: name,
      signedByEmail: email,
      signatureData: signatureDataUrl,
      consentText,
      quoteSnapshot: snap as never,
      snapshotHash,
      signedIp: ip,
      signedUserAgent: userAgent,
    });

    if (result === "not_found") throw new NotFoundError();
    if (result === "already_signed" || result === "declined") {
      throw new ConflictError(
        `Quote already ${result === "already_signed" ? "accepted" : "declined"}`
      );
    }

    return { ok: true };
  }
);
