import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  type PublicEstimate,
  PublicEstimateView,
} from "@/components/estimates/PublicEstimateView";
import { getEstimateByToken, markEstimateViewed } from "@/lib/repositories";
import { parseQtyMode } from "@/lib/utils";

export const metadata = {
  title: "Estimate — SqFt",
  // Public token URLs must not be indexed.
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PublicEstimatePage({ params }: Props) {
  const { token } = await params;

  // Reject any token shape that couldn't have been issued, before hitting the DB.
  if (!token || token.length < 16 || token.length > 128) notFound();

  const estimate = await getEstimateByToken(token);
  if (!estimate) notFound();

  if (estimate.status !== "approved" && estimate.status !== "declined") {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;
    void markEstimateViewed(estimate.id, { ip, userAgent });
  }

  const view: PublicEstimate = {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    status: estimate.status as PublicEstimate["status"],
    date: estimate.date,
    convenienceFeeRate: estimate.convenienceFeeRate,
    markupPct: estimate.markupPct,
    depositPct: estimate.depositPct,
    siteMeasure: {
      id: estimate.siteMeasure.id,
      siteMeasureNumber: estimate.siteMeasure.siteMeasureNumber,
      title: estimate.siteMeasure.title,
    },
    customer: estimate.siteMeasure.location.customer
      ? {
          name: estimate.siteMeasure.location.customer.name,
          address: estimate.siteMeasure.location.address,
          email: estimate.siteMeasure.location.customer.email,
        }
      : null,
    items: estimate.siteMeasure.items.map((i) => ({
      id: i.id,
      type: i.type === "room" ? "room" : "note",
      shape: i.shape === "rect" || i.shape === "tri" ? i.shape : null,
      w: i.w,
      l: i.l,
      name: i.name,
      note: i.note,
      text: i.text,
    })),
    lineItems: estimate.lineItems.map((li) => ({
      id: li.id,
      name: li.name,
      rate: li.rate,
      qtyMode: parseQtyMode(li.qtyMode),
      qty: li.qty,
      wastePct: li.wastePct,
      unitLabel: li.unitLabel,
      linkedRoomIds: li.linkedRoomIds,
      sortOrder: li.sortOrder,
    })),
    org: {
      name: estimate.org.name,
      phone: estimate.org.phone,
      address: estimate.org.address,
      licenseNumber: estimate.org.licenseNumber,
      logo: estimate.org.logo,
      ownerEmail: estimate.org.users[0]?.email ?? null,
    },
    sentAt: estimate.sentAt,
    viewedAt: estimate.viewedAt,
    approvedAt: estimate.approvedAt,
    declinedAt: estimate.declinedAt,
    declineReason: estimate.declineReason,
  };

  return <PublicEstimateView estimate={view} token={token} />;
}
