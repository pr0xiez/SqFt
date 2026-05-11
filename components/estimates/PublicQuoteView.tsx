import type { RoomItem as _RoomItem, LineItemCalc } from "@/lib/utils";
import { liSubtotal, type RoomItem } from "@/lib/utils";
import { Letterhead } from "./public-quote/Letterhead";
import { LineItemsTable } from "./public-quote/LineItemsTable";
import { PartiesBlock } from "./public-quote/PartiesBlock";
import { PublicQuoteAcceptBlock } from "./public-quote/PublicQuoteAcceptBlock";
import { PublicQuoteHeader } from "./public-quote/PublicQuoteHeader";
import { PublicQuoteSignedView } from "./public-quote/PublicQuoteSignedView";
import { PublicQuoteStatusBar } from "./public-quote/PublicQuoteStatusBar";
import { RoomsList } from "./public-quote/RoomsList";
import { TotalsBlock } from "./public-quote/TotalsBlock";

export interface PublicQuote {
  id: number;
  quoteNumber: number;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  date: string | Date;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  estimate: { id: number; estimateNumber: number | null; title: string };
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
  };
  sentAt?: Date | string | null;
  viewedAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  signature?: {
    signedByName: string;
    signedByEmail: string;
    signedAt: Date | string;
    signatureData: string;
  } | null;
}

interface Props {
  quote: PublicQuote;
  token: string;
}

export function PublicQuoteView({ quote, token }: Props) {
  const rooms = quote.items.filter((i): i is RoomItem => i.type === "room");
  const subtotal = quote.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const markup = subtotal * (quote.markupPct / 100);
  const beforeTax = subtotal + markup;
  const tax = beforeTax * quote.taxRate;
  const total = beforeTax + tax;
  const deposit = total * quote.depositPct;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <PublicQuoteHeader
        orgName={quote.org.name}
        orgAddress={quote.org.address}
      />
      <PublicQuoteStatusBar
        status={quote.status}
        sentAt={quote.sentAt}
        acceptedAt={quote.acceptedAt}
        declinedAt={quote.declinedAt}
      />
      <div className="max-w-[880px] mx-auto mb-8 px-7">
        <div className="bg-[var(--paper)] rounded-lg shadow-[0_1px_0_rgba(20,18,12,0.04),0_6px_22px_rgba(20,18,12,0.07),0_32px_80px_rgba(20,18,12,0.06)] overflow-hidden relative print:shadow-none print:border print:border-[#ddd]">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-l)] print:hidden" />
          <div className="p-12 sm:p-14">
            <Letterhead
              quoteNumber={quote.quoteNumber}
              date={quote.date}
              org={quote.org}
            />
            <PartiesBlock
              customer={quote.customer}
              projectTitle={quote.estimate.title}
            />
            <RoomsList rooms={rooms} />
            <LineItemsTable lineItems={quote.lineItems} rooms={rooms} />
            <TotalsBlock
              subtotal={subtotal}
              markup={markup}
              markupPct={quote.markupPct}
              tax={tax}
              taxRate={quote.taxRate}
              total={total}
              deposit={deposit}
              depositPct={quote.depositPct}
            />
            {quote.status === "accepted" && quote.signature ? (
              <PublicQuoteSignedView
                signedByName={quote.signature.signedByName}
                signedAt={quote.signature.signedAt}
                signatureData={quote.signature.signatureData}
              />
            ) : quote.status === "declined" ? null : (
              <PublicQuoteAcceptBlock
                token={token}
                customerEmail={quote.customer?.email ?? null}
                onDeclineClick={() => {
                  /* re-wired to DeclineModal in Phase 9 */
                }}
              />
            )}
            {quote.status === "declined" && (
              <div className="mt-9 pt-6 border-t border-[var(--line)] text-[14px] text-[var(--ink-2)]">
                This quote was declined on{" "}
                {new Date(quote.declinedAt ?? Date.now()).toLocaleDateString()}.
                {quote.declineReason ? (
                  <div className="mt-2 italic text-[var(--muted)]">
                    "{quote.declineReason}"
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
