import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendSignedNotification } from "@/lib/email/sendSignedNotification";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { fromPrismaQuote } from "@/lib/quoteView";
import { canonicalize, sha256, snapshotQuote } from "@/lib/quoteView/snapshot";
import { acceptQuoteByToken, getQuoteByToken } from "@/lib/repositories";
import { withLogging } from "@/lib/with-logging";

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  signatureDataUrl: z
    .string()
    .startsWith("data:image/png;base64,", "Signature must be a base64 PNG"),
  consentText: z.string().min(1).max(2000),
});

const MAX_SIG_BYTES = 100 * 1024;

type RouteParams = { params: Promise<{ token: string }> };

export const POST = withLogging(
  async (req: NextRequest, ctx: RouteParams | undefined) => {
    try {
      const params = ctx?.params;
      const { token } = params ? await params : { token: "" };
      if (!token || token.length < 16 || token.length > 128) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid body" },
          { status: 400 }
        );
      }
      const { name, email, signatureDataUrl, consentText } = parsed.data;

      // Decoded length check (base64 → bytes ≈ length × 3/4)
      const b64 = signatureDataUrl.slice("data:image/png;base64,".length);
      if ((b64.length * 3) / 4 > MAX_SIG_BYTES) {
        return NextResponse.json(
          { error: "Signature image too large (>100KB)" },
          { status: 400 }
        );
      }

      const quote = await getQuoteByToken(token);
      if (!quote) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (quote.status === "accepted" || quote.status === "declined") {
        return NextResponse.json(
          { error: `Quote already ${quote.status}` },
          { status: 409 }
        );
      }

      // Build snapshot from the live quote
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

      if (result === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (result === "already_signed" || result === "declined") {
        return NextResponse.json(
          {
            error: `Quote already ${result === "already_signed" ? "accepted" : "declined"}`,
          },
          { status: 409 }
        );
      }

      // Fire-and-forget owner notification
      void notifyOwners(quote.orgId, {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        customerName: name,
        customerEmail: email,
        total: snap.totals.total,
        deposit: snap.totals.deposit,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      logError({
        errorMessage: err instanceof Error ? err.message : "accept failed",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

async function notifyOwners(
  orgId: string,
  args: {
    quoteId: number;
    quoteNumber: number;
    customerName: string;
    customerEmail: string;
    total: number;
    deposit: number;
  }
) {
  try {
    const owners = await prisma.user.findMany({
      where: { orgId, role: "owner" },
      select: { email: true },
    });
    const recipients = owners.map((o) => o.email).filter(Boolean);
    await sendSignedNotification({
      variant: "accepted",
      to: recipients,
      quoteId: args.quoteId,
      quoteNumber: args.quoteNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      signedAt: new Date(),
      total: args.total,
      deposit: args.deposit,
    });
  } catch (err) {
    logError({ errorMessage: "Owner notification failed", err });
  }
}
