import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendSignedNotification } from "@/lib/email/sendSignedNotification";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { declineQuoteByToken, getQuoteByToken } from "@/lib/repositories";
import { withLogging } from "@/lib/with-logging";

const bodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

type RouteParams = { params: Promise<{ token: string }> };

export const POST = withLogging(
  async (req: NextRequest, ctx: RouteParams | undefined) => {
    try {
      const p = ctx?.params;
      const { token } = p ? await p : { token: "" };
      if (!token || token.length < 16 || token.length > 128) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }

      const quote = await getQuoteByToken(token);
      if (!quote)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (quote.status === "accepted" || quote.status === "declined") {
        return NextResponse.json(
          { error: `Quote already ${quote.status}` },
          { status: 409 }
        );
      }

      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const userAgent = req.headers.get("user-agent") ?? null;

      const result = await declineQuoteByToken(quote.id, {
        reason: parsed.data.reason ?? null,
        ip,
        userAgent,
      });
      if (result === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (result !== "ok") {
        return NextResponse.json(
          { error: `Quote already ${result.replace("already_", "")}` },
          { status: 409 }
        );
      }

      // Fire-and-forget owner notification
      void notifyDeclined(quote.orgId, {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        customerName: quote.estimate.customer?.name ?? "Customer",
        customerEmail: quote.estimate.customer?.email ?? null,
        reason: parsed.data.reason,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      logError({
        errorMessage: err instanceof Error ? err.message : "decline failed",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
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
