import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  type PublicQuote,
  PublicQuoteView,
} from "@/components/estimates/PublicQuoteView";
import { getQuoteByToken, markQuoteViewed } from "@/lib/repositories";

export const metadata = {
  title: "Quote — SqFt",
  // Public token URLs must not be indexed.
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params;

  // Reject any token shape that couldn't have been issued, before hitting the DB.
  if (!token || token.length < 16 || token.length > 128) notFound();

  const quote = await getQuoteByToken(token);
  if (!quote) notFound();

  if (quote.status !== "accepted" && quote.status !== "declined") {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;
    void markQuoteViewed(quote.id, { ip, userAgent });
  }

  const view: PublicQuote = {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status as PublicQuote["status"],
    date: quote.date,
    convenienceFeeRate: quote.convenienceFeeRate,
    markupPct: quote.markupPct,
    depositPct: quote.depositPct,
    estimate: {
      id: quote.estimate.id,
      estimateNumber: quote.estimate.estimateNumber,
      title: quote.estimate.title,
    },
    customer: quote.estimate.customer
      ? {
          name: quote.estimate.customer.name,
          address: quote.estimate.customer.address,
          email: quote.estimate.customer.email,
        }
      : null,
    items: quote.estimate.items.map((i) => ({
      id: i.id,
      type: i.type === "room" ? "room" : "note",
      shape: i.shape === "rect" || i.shape === "tri" ? i.shape : null,
      w: i.w,
      l: i.l,
      name: i.name,
      note: i.note,
      text: i.text,
    })),
    lineItems: quote.lineItems.map((li) => ({
      id: li.id,
      name: li.name,
      rate: li.rate,
      qtyMode: li.qtyMode === "linked" ? "linked" : "manual",
      qty: li.qty,
      wastePct: li.wastePct,
      unitLabel: li.unitLabel,
      linkedRoomIds: li.linkedRoomIds,
      sortOrder: li.sortOrder,
    })),
    org: {
      name: quote.org.name,
      phone: quote.org.phone,
      address: quote.org.address,
      licenseNumber: quote.org.licenseNumber,
      logo: quote.org.logo,
      ownerEmail: quote.org.users[0]?.email ?? null,
    },
    sentAt: quote.sentAt,
    viewedAt: quote.viewedAt,
    acceptedAt: quote.acceptedAt,
    declinedAt: quote.declinedAt,
    declineReason: quote.declineReason,
    signature: quote.signature
      ? {
          signedByName: quote.signature.signedByName,
          signedByEmail: quote.signature.signedByEmail,
          signedAt: quote.signature.signedAt,
          signatureData: quote.signature.signatureData,
        }
      : null,
  };

  return <PublicQuoteView quote={view} token={token} />;
}
