import { PayInvoiceButton } from "@/components/invoices/PayInvoiceButton";
import { Banner, PaymentConfirm } from "@/components/invoices/PaymentConfirm";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDollar } from "@/lib/utils";

export interface PublicInvoice {
  invoiceNumber: number;
  status: string;
  dueLabel: string | null;
  /** The full invoice amount. */
  amountFormatted: string;
  /** Sum of recorded payments; null when nothing has been paid yet. */
  paidFormatted: string | null;
  /** amount − payments — what the customer still owes. */
  balanceDueFormatted: string;
  memo: string | null;
  terms: string;
  paymentInstructions: string;
  /** True when the org has an active Stripe Connect account and there is a
   *  balance remaining. Replaces the old static `payUrl` field. */
  canPayOnline: boolean;
  /** The invoice's public token — passed through to PayInvoiceButton. */
  token: string;
  /** Reflects the ?pay= query param set by Stripe's return URL. */
  payResult: "success" | "cancelled" | null;
  /** The Checkout Session ID from ?session_id=; present only on success return. */
  sessionId: string | null;
  org: {
    name: string;
    phone: string | null;
    address: string | null;
    logo: string | null;
  };
  customer: { name: string | null; address: string | null } | null;
  lines: Array<{ name: string; description: string | null; amount: number }>;
}

export function PublicInvoiceView({ invoice }: { invoice: PublicInvoice }) {
  return (
    <main className="min-h-dvh bg-[var(--bg)] px-3 py-4 sm:px-6 sm:py-10 print:p-0 print:bg-transparent">
      <div className="max-w-[720px] mx-auto">
        <div className="mb-3 sm:mb-4 print:hidden">
          <StatusBadge status={invoice.status} />
        </div>

        <article className="bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)] shadow-[var(--shadow)] px-5 py-7 sm:p-10 print:shadow-none">
          <header className="pb-7 sm:pb-8 border-b border-[var(--line)] mb-7 sm:mb-8 flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="type-display text-[36px] sm:text-[46px]">
                Invoice
              </h1>
              <p className="type-figure text-[13.5px] text-[var(--ink-2)] mt-2.5">
                #{invoice.invoiceNumber}
                {invoice.dueLabel ? <> · Due {invoice.dueLabel}</> : null}
              </p>
            </div>
            <div className="min-w-0 sm:text-right">
              {invoice.org.logo ? (
                // biome-ignore lint/performance/noImgElement: customer-facing static logo URL
                <img
                  src={invoice.org.logo}
                  alt={invoice.org.name}
                  height={40}
                  className="h-10 w-auto mb-2.5 sm:ml-auto"
                />
              ) : null}
              <div className="type-heading">{invoice.org.name}</div>
              <div className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">
                {invoice.org.address ? <div>{invoice.org.address}</div> : null}
                {invoice.org.phone ? (
                  <div className="type-figure">{invoice.org.phone}</div>
                ) : null}
              </div>
            </div>
          </header>

          {invoice.customer || invoice.terms ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mb-8">
              {invoice.customer ? (
                <section>
                  <div className="type-label mb-1.5">Bill to</div>
                  <div className="text-[17px] font-[620] tracking-[-0.015em]">
                    {invoice.customer.name}
                  </div>
                  {invoice.customer.address ? (
                    <div className="mt-1 text-[14px] text-[var(--ink-2)] leading-relaxed whitespace-pre-line">
                      {invoice.customer.address}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {invoice.terms ? (
                <section>
                  <div className="type-label mb-1.5">Terms</div>
                  <div className="text-[14px] text-[var(--ink-2)] leading-relaxed whitespace-pre-line">
                    {invoice.terms}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          <table className="w-full text-[14.5px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--line-2)] text-[13px] text-[var(--muted)]">
                <th scope="col" className="pb-2.5 pr-4 text-left font-[500]">
                  Description
                </th>
                <th scope="col" className="pb-2.5 text-right font-[500]">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr
                  key={`${line.name}-${i}`}
                  className="border-b border-[var(--line)]"
                >
                  <td className="py-3.5 pr-4 align-top">
                    <div className="text-[15px] font-[560]">{line.name}</div>
                    {line.description ? (
                      <div className="mt-1 text-[13.5px] text-[var(--muted)]">
                        {line.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3.5 text-right align-top whitespace-nowrap type-figure">
                    {fmtDollar(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 flex flex-col sm:items-end">
            <div className="w-full sm:w-auto sm:min-w-[300px]">
              {invoice.paidFormatted ? (
                <>
                  <div className="flex justify-between gap-6 py-1 text-[14.5px] text-[var(--ink-2)]">
                    <span>Invoice total</span>
                    <span className="type-figure">
                      {invoice.amountFormatted}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6 py-1 text-[14.5px] text-[var(--ink-2)]">
                    <span>Paid to date</span>
                    <span className="type-figure">
                      −{invoice.paidFormatted}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex items-baseline justify-between gap-6 mt-2 pt-3 border-t border-[var(--line-2)]">
                <span className="text-[15px] font-[650]">Balance due</span>
                <span className="type-stat text-[32px] sm:text-[40px] text-[var(--ink)] text-right">
                  {invoice.balanceDueFormatted}
                </span>
              </div>
            </div>
          </div>

          {invoice.payResult === "success" && invoice.sessionId ? (
            // Only a verified session (via PaymentConfirm) may show a confirmation.
            // `?pay=success` alone is unverified and must not render a banner.
            <PaymentConfirm
              token={invoice.token}
              sessionId={invoice.sessionId}
            />
          ) : invoice.payResult === "cancelled" ? (
            <Banner tone="neutral" icon="info">
              Payment cancelled.
            </Banner>
          ) : null}

          {invoice.canPayOnline ? (
            <div className="mt-8 pt-7 border-t border-[var(--line)] flex sm:justify-end print:hidden">
              <PayInvoiceButton token={invoice.token} />
            </div>
          ) : null}

          {invoice.paymentInstructions ? (
            <p className="text-[13.5px] text-[var(--muted)] mt-7 leading-relaxed whitespace-pre-line">
              {invoice.paymentInstructions}
            </p>
          ) : null}
        </article>
      </div>
    </main>
  );
}
