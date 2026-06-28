import { PayInvoiceButton } from "@/components/invoices/PayInvoiceButton";
import { PaymentConfirm } from "@/components/invoices/PaymentConfirm";
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
    <main className="max-w-[640px] mx-auto p-8">
      <header className="flex items-start justify-between gap-6 pb-6 border-b border-[var(--line)] mb-6 flex-wrap">
        <div>
          {invoice.org.logo ? (
            // biome-ignore lint/performance/noImgElement: customer-facing static logo URL
            <img
              src={invoice.org.logo}
              alt={invoice.org.name}
              height={40}
              className="h-10 mb-2"
            />
          ) : null}
          <div className="text-[14px] font-[700]">{invoice.org.name}</div>
          {invoice.org.phone ? (
            <div className="text-[12px] text-[var(--muted)]">
              {invoice.org.phone}
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Invoice № {invoice.invoiceNumber}
          </div>
          {invoice.dueLabel ? (
            <div className="text-[12px] text-[var(--muted)]">
              DUE {invoice.dueLabel}
            </div>
          ) : null}
          <div className="text-[32px] font-[700] leading-none mt-2">
            {invoice.balanceDueFormatted}
          </div>
        </div>
      </header>

      {invoice.customer ? (
        <section className="mb-4 text-[13px]">
          <div className="text-[var(--muted)] uppercase text-[10px] tracking-wide">
            Bill to
          </div>
          <div className="font-[600]">{invoice.customer.name}</div>
          {invoice.customer.address ? (
            <div>{invoice.customer.address}</div>
          ) : null}
        </section>
      ) : null}

      {invoice.terms ? (
        <section className="mb-4 text-[13px]">
          <span className="text-[var(--muted)] uppercase text-[10px] tracking-wide mr-2">
            Terms
          </span>
          {invoice.terms}
        </section>
      ) : null}

      <table className="w-full text-[13px] border-collapse">
        <tbody>
          {invoice.lines.map((line, i) => (
            <tr
              key={`${line.name}-${i}`}
              className="border-b border-[var(--line)]"
            >
              <td className="py-2 pr-4 align-top">
                <div className="font-[600]">{line.name}</div>
                {line.description ? (
                  <div className="text-[var(--muted)]">{line.description}</div>
                ) : null}
              </td>
              <td className="py-2 text-right align-top whitespace-nowrap">
                {fmtDollar(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {invoice.paidFormatted ? (
            <>
              <tr>
                <td className="py-2">Invoice total</td>
                <td className="py-2 text-right">{invoice.amountFormatted}</td>
              </tr>
              <tr>
                <td className="py-2">Paid to date</td>
                <td className="py-2 text-right">−{invoice.paidFormatted}</td>
              </tr>
            </>
          ) : null}
          <tr>
            <td className="py-3 font-[700]">Balance due</td>
            <td className="py-3 text-right font-[700]">
              {invoice.balanceDueFormatted}
            </td>
          </tr>
        </tfoot>
      </table>

      {invoice.payResult === "success" ? (
        invoice.sessionId ? (
          <PaymentConfirm token={invoice.token} sessionId={invoice.sessionId} />
        ) : (
          <div className="my-6 rounded-md bg-green-50 border border-green-200 px-5 py-4 text-[14px] font-[600] text-green-800">
            Payment received — thank you!
          </div>
        )
      ) : invoice.payResult === "cancelled" ? (
        <div className="my-6 rounded-md bg-[var(--surface)] border border-[var(--line)] px-5 py-4 text-[14px] text-[var(--muted)]">
          Payment cancelled.
        </div>
      ) : null}

      {invoice.canPayOnline ? (
        <div className="my-6">
          <PayInvoiceButton token={invoice.token} />
        </div>
      ) : null}

      {invoice.paymentInstructions ? (
        <p className="text-[12px] text-[var(--muted)] mt-6">
          {invoice.paymentInstructions}
        </p>
      ) : null}
    </main>
  );
}
