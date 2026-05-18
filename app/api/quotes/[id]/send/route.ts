import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { sendQuoteEmail } from "@/lib/email/sendQuoteEmail";
import { logError } from "@/lib/logger";
import {
  getQuote,
  markQuoteSent,
  rotateApprovalToken,
  writeQuoteEvent,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { type LineItemCalc, quoteTotal, type RoomItem } from "@/lib/utils";
import { withLogging } from "@/lib/with-logging";

const bodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  regenerateLink: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const session = await auth();
      const sender = session?.user;
      if (!sender?.email || !sender?.name) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;
      const quoteId = parseInt(id, 10);
      if (Number.isNaN(quoteId)) {
        return NextResponse.json({ error: "Bad id" }, { status: 400 });
      }

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid body" },
          { status: 400 }
        );
      }
      const { to, subject, message, regenerateLink } = parsed.data;

      const quote = await getQuote(quoteId, orgId);
      if (!quote) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (quote.status === "accepted" || quote.status === "declined") {
        return NextResponse.json(
          { error: `Cannot re-send a ${quote.status} quote` },
          { status: 409 }
        );
      }

      let token = quote.approvalToken;
      if (regenerateLink || !token) {
        token = await rotateApprovalToken(quoteId, orgId);
        if (!token) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        await writeQuoteEvent({
          quoteId,
          type: "link_rotated",
          actorEmail: sender.email,
          actorName: sender.name,
        });
      }

      const publicUrl = `${getPublicBaseUrl()}/q/${token}`;

      const total =
        quoteTotal({
          lineItems: quote.lineItems as LineItemCalc[],
          estimate: { items: quote.estimate.items as RoomItem[] },
          markupPct: quote.markupPct,
          convenienceFeeRate: quote.convenienceFeeRate,
        }) ?? 0;

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
        return NextResponse.json(
          { error: sendResult.error ?? "Email failed" },
          { status: 502 }
        );
      }

      const marked = await markQuoteSent(quoteId, orgId, {
        to,
        subject,
        sentByEmail: sender.email,
        sentByName: sender.name,
      });
      if (!marked) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      if (quote.estimate.customer && quote.estimate.customer.email !== to) {
        void updateCustomerEmail(quote.estimate.customer.id, orgId, to);
      }

      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      logError({
        errorMessage: err instanceof Error ? err.message : "send quote failed",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

async function getOrgForEmail(orgId: string) {
  const { prisma } = await import("@/lib/prisma");
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, phone: true, logo: true },
  });
  return org;
}

async function updateCustomerEmail(
  customerId: number,
  orgId: string,
  email: string
) {
  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.customer.updateMany({
      where: { id: customerId, orgId },
      data: { email },
    });
  } catch (err) {
    logError({ errorMessage: "Failed to save customer email", err });
  }
}
