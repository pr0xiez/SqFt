import { computeEstimateView, foldMarkupIntoLines } from "@/lib/estimateView";
import type {
  RoomItem as _RoomItem,
  LineItemCalc,
  RoomItem,
} from "@/lib/utils";
import { Letterhead } from "./public-estimate/Letterhead";
import { LineItemsTable } from "./public-estimate/LineItemsTable";
import { PartiesBlock } from "./public-estimate/PartiesBlock";
import { PublicEstimateAcceptBlockWithDecline } from "./public-estimate/PublicEstimateAcceptBlockWithDecline";
import { PublicEstimateHeader } from "./public-estimate/PublicEstimateHeader";
import { PublicEstimateStatusBar } from "./public-estimate/PublicEstimateStatusBar";
import { RoomsList } from "./public-estimate/RoomsList";
import { TotalsBlock } from "./public-estimate/TotalsBlock";

export interface PublicEstimate {
  id: number;
  estimateNumber: number;
  status: "draft" | "sent" | "viewed" | "approved" | "declined";
  date: string | Date;
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  siteMeasure: { id: number; siteMeasureNumber: number | null };
  customer: {
    name: string;
    address: string | null;
    email: string | null;
  } | null;
  items: _RoomItem[];
  lineItems: LineItemCalc[];
  org: {
    name: string;
    phone: string | null;
    address: string | null;
    licenseNumber: string | null;
    logo: string | null;
    ownerEmail: string | null;
  };
  sentAt?: Date | string | null;
  viewedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
}

interface Props {
  estimate: PublicEstimate;
  token: string;
}

export function PublicEstimateView({ estimate, token }: Props) {
  const rooms = estimate.items.filter((i): i is RoomItem => i.type === "room");
  const view = computeEstimateView({
    lineItems: estimate.lineItems,
    items: estimate.items,
    markupPct: estimate.markupPct,
    convenienceFeeRate: estimate.convenienceFeeRate,
    depositPct: estimate.depositPct,
  });
  const { convenienceFee, total, deposit } = view;
  const foldedLineAmounts = foldMarkupIntoLines(view);
  const markedUpSubtotal = view.beforeFee;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <PublicEstimateHeader
        orgName={estimate.org.name}
        orgAddress={estimate.org.address}
      />
      <PublicEstimateStatusBar
        status={estimate.status}
        sentAt={estimate.sentAt}
        approvedAt={estimate.approvedAt}
        declinedAt={estimate.declinedAt}
      />
      <div className="max-w-[880px] mx-auto mb-8 px-7">
        <div className="bg-[var(--paper)] rounded-lg shadow-[0_1px_0_rgba(20,18,12,0.04),0_6px_22px_rgba(20,18,12,0.07),0_32px_80px_rgba(20,18,12,0.06)] overflow-hidden relative print:shadow-none print:border print:border-[#ddd]">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-l)] print:hidden" />
          <div className="p-12 sm:p-14">
            <Letterhead
              estimateNumber={estimate.estimateNumber}
              date={estimate.date}
              org={estimate.org}
            />
            <PartiesBlock customer={estimate.customer} />
            <RoomsList rooms={rooms} />
            <LineItemsTable
              lineItems={estimate.lineItems}
              subtotals={
                new Map(
                  view.lines.map((l, idx) => [l.id, foldedLineAmounts[idx]])
                )
              }
            />
            <TotalsBlock
              subtotal={markedUpSubtotal}
              convenienceFee={convenienceFee}
              convenienceFeeRate={estimate.convenienceFeeRate}
              total={total}
              deposit={deposit}
              depositPct={estimate.depositPct}
            />
            {estimate.status === "approved" ||
            estimate.status === "declined" ? null : (
              <PublicEstimateAcceptBlockWithDecline token={token} />
            )}
            {estimate.status === "declined" && (
              <div className="mt-9 pt-6 border-t border-[var(--line)]">
                <div className="text-[14px] text-[var(--ink-2)]">
                  This estimate was declined on{" "}
                  {new Date(
                    estimate.declinedAt ?? Date.now()
                  ).toLocaleDateString()}
                  .
                </div>
                {estimate.declineReason ? (
                  <div className="mt-2 italic text-[var(--muted)] text-[14px]">
                    "{estimate.declineReason}"
                  </div>
                ) : null}
                {(estimate.org.phone || estimate.org.ownerEmail) && (
                  <div className="mt-5 text-[13px] text-[var(--ink-2)]">
                    Changed your mind or have questions? Contact{" "}
                    <span className="font-[600]">{estimate.org.name}</span>:
                    <div className="mt-1 font-[var(--font-mono)] text-[12px]">
                      {estimate.org.phone && <span>{estimate.org.phone}</span>}
                      {estimate.org.phone && estimate.org.ownerEmail && (
                        <span> · </span>
                      )}
                      {estimate.org.ownerEmail && (
                        <a
                          href={`mailto:${estimate.org.ownerEmail}`}
                          className="text-[var(--accent)] underline"
                        >
                          {estimate.org.ownerEmail}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
