import { notFound } from "next/navigation";
import {
  type PublicEstimate,
  PublicQuoteView,
} from "@/components/estimates/PublicQuoteView";
import { getEstimateByToken } from "@/lib/repositories";
import type { LShapeData } from "@/lib/utils";

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

  const estimate = await getEstimateByToken(token);
  if (!estimate) notFound();

  const view: PublicEstimate = {
    id: estimate.id,
    title: estimate.title,
    quoteNumber: estimate.quoteNumber,
    date: estimate.date,
    taxRate: estimate.taxRate,
    markupPct: estimate.markupPct,
    depositPct: estimate.depositPct,
    customer: estimate.customer
      ? { name: estimate.customer.name, address: estimate.customer.address }
      : null,
    items: estimate.items.map((i) => ({
      id: i.id,
      type: i.type === "room" ? "room" : "note",
      shape:
        i.shape === "rect" || i.shape === "tri" || i.shape === "lshape"
          ? i.shape
          : null,
      w: i.w,
      l: i.l,
      lshapeData: i.lshapeData as LShapeData | null,
      name: i.name,
      note: i.note,
      text: i.text,
    })),
    lineItems: estimate.lineItems.map((li) => ({
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
    org: estimate.org,
  };

  return <PublicQuoteView estimate={view} />;
}
