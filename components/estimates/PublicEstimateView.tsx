import { type EstimateStatus, isEstimateLocked } from "@/lib/estimateStatus";
import {
  computeEstimateView,
  type EstimateView,
  foldMarkupIntoLines,
} from "@/lib/estimateView";
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
  status: EstimateStatus;
  date: string | Date;
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
  /** Frozen view (per-line qty/subtotal + signed totals) reconstructed from
   *  the approval snapshot. When present, rendering uses these stored numbers
   *  instead of recomputing from `estimate.lineItems`, so an approved
   *  document can never drift from what the customer signed. */
  frozenView?: EstimateView;
}

export function PublicEstimateView({ estimate, token, frozenView }: Props) {
  const rooms = estimate.items.filter((i): i is RoomItem => i.type === "room");
  const view =
    frozenView ??
    computeEstimateView({
      lineItems: estimate.lineItems,
      items: estimate.items,
      markupPct: estimate.markupPct,
      depositPct: estimate.depositPct,
    });
  const { total, deposit } = view;
  const foldedLineAmounts = foldMarkupIntoLines(view);

  return (
    <div className="min-h-dvh bg-[var(--bg)] px-3 py-4 sm:px-6 sm:py-10 print:p-0 print:bg-transparent">
      <div className="max-w-[820px] mx-auto">
        <PublicEstimateHeader>
          <PublicEstimateStatusBar
            status={estimate.status}
            sentAt={estimate.sentAt}
            approvedAt={estimate.approvedAt}
            declinedAt={estimate.declinedAt}
          />
        </PublicEstimateHeader>
        <article className="bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)] shadow-[var(--shadow)] px-5 py-7 sm:p-10 md:p-12 print:shadow-none">
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
            total={total}
            deposit={deposit}
            depositPct={estimate.depositPct}
          />
          {isEstimateLocked(estimate.status) ? null : (
            <PublicEstimateAcceptBlockWithDecline token={token} />
          )}
          {estimate.status === "declined" && (
            <section className="mt-10 pt-7 border-t border-[var(--line)]">
              <p className="text-[15px] text-[var(--ink-2)]">
                This estimate was declined on{" "}
                {new Date(
                  estimate.declinedAt ?? Date.now()
                ).toLocaleDateString()}
                .
              </p>
              {estimate.declineReason ? (
                <p className="mt-2 italic text-[var(--muted)] text-[14.5px]">
                  "{estimate.declineReason}"
                </p>
              ) : null}
              {(estimate.org.phone || estimate.org.ownerEmail) && (
                <div className="mt-5 text-[14px] text-[var(--ink-2)]">
                  Changed your mind or have questions? Contact{" "}
                  <span className="font-[600]">{estimate.org.name}</span>:
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {estimate.org.phone && (
                      <span className="type-figure text-[var(--ink)]">
                        {estimate.org.phone}
                      </span>
                    )}
                    {estimate.org.phone && estimate.org.ownerEmail && (
                      <span aria-hidden="true" className="text-[var(--muted)]">
                        ·
                      </span>
                    )}
                    {estimate.org.ownerEmail && (
                      <a
                        href={`mailto:${estimate.org.ownerEmail}`}
                        className="text-[var(--ink)] underline underline-offset-[3px] decoration-[var(--line-2)] break-all"
                      >
                        {estimate.org.ownerEmail}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
