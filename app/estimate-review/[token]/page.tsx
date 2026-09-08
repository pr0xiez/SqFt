import { notFound } from "next/navigation";
import {
  type PublicEstimate,
  PublicEstimateView,
} from "@/components/estimates/PublicEstimateView";
import {
  estimateViewFromSnapshot,
  parseEstimateSnapshot,
  snapshotLineItemCalcs,
  snapshotRoomItems,
} from "@/lib/estimateView/parseSnapshot";
import { logError } from "@/lib/logger";
import { getEstimateByToken, markEstimateViewed } from "@/lib/repositories";
import { isValidTokenShape, trackPublicView } from "@/lib/tokens";
import { parseQtyMode, parseRoomSegments } from "@/lib/utils";

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
  if (!token || !isValidTokenShape(token)) notFound();

  const estimate = await getEstimateByToken(token);
  if (!estimate) notFound();

  await trackPublicView(
    estimate.status !== "approved" && estimate.status !== "declined",
    (meta) => markEstimateViewed(estimate.id, meta)
  );

  // An approved estimate renders from the approval snapshot — the frozen
  // record of what the customer signed — not from the live rows, whose
  // computed view can still drift (the underlying site measure stays
  // editable after approval, and the area/markup math can change between
  // releases). A snapshot that fails validation falls back to the live
  // render rather than crashing the customer-facing page.
  const snap =
    estimate.status === "approved" && estimate.approval
      ? parseEstimateSnapshot(estimate.approval.snapshot)
      : null;
  if (estimate.status === "approved" && estimate.approval && snap === null) {
    logError({
      path: "/estimate-review",
      errorMessage: `approval snapshot for estimate ${estimate.id} failed validation; rendering live data`,
    });
  }

  const live: PublicEstimate = {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    status: estimate.status as PublicEstimate["status"],
    date: estimate.date,
    markupPct: estimate.markupPct,
    depositPct: estimate.depositPct,
    siteMeasure: {
      id: estimate.siteMeasure.id,
      siteMeasureNumber: estimate.siteMeasure.siteMeasureNumber,
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
      shape: i.shape === "rect" ? "rect" : null,
      w: i.w,
      l: i.l,
      segments: parseRoomSegments(i.segments),
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

  // The snapshot overrides everything the customer signed; lifecycle
  // timestamps and the org contact email (shown for follow-up questions)
  // stay live.
  const view: PublicEstimate = snap
    ? {
        ...live,
        estimateNumber: snap.estimateNumber,
        date: snap.date,
        markupPct: snap.markupPct,
        depositPct: snap.depositPct,
        customer: snap.customer
          ? {
              name: snap.customer.name ?? "",
              address: snap.customer.address ?? null,
              email: snap.customer.email ?? null,
            }
          : null,
        items: snapshotRoomItems(snap),
        lineItems: snapshotLineItemCalcs(snap),
        org: {
          ...live.org,
          name: snap.org.name,
          phone: snap.org.phone ?? null,
          address: snap.org.address ?? null,
          licenseNumber: snap.org.licenseNumber ?? null,
          logo: snap.org.logo ?? null,
        },
      }
    : live;

  return (
    <PublicEstimateView
      estimate={view}
      token={token}
      frozenView={snap ? estimateViewFromSnapshot(snap) : undefined}
    />
  );
}
