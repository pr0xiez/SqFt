import { notFound } from "next/navigation";
import {
  type PublicInvoice,
  PublicInvoiceView,
} from "@/components/invoices/PublicInvoiceView";
import { invoiceOutstanding, paymentsPaidTotal } from "@/lib/invoices/compute";
import { parseInvoiceSnapshot } from "@/lib/invoices/parseSnapshot";
import { round2 } from "@/lib/money";
import {
  getInvoiceByToken,
  getOrgStripe,
  markInvoiceViewed,
} from "@/lib/repositories";
import { isValidTokenShape, trackPublicView } from "@/lib/tokens";
import { fmtDollar } from "@/lib/utils";

export const metadata = {
  title: "Invoice — SqFt",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pay?: string; session_id?: string }>;
}

export default async function PublicInvoicePage({
  params,
  searchParams,
}: Props) {
  const { token } = await params;
  const { pay, session_id } = await searchParams;
  if (!token || !isValidTokenShape(token)) notFound();

  const invoice = await getInvoiceByToken(token);
  if (!invoice || !invoice.snapshot) notFound();
  // A void invoice is terminal: the link must die with it so a customer can't
  // open — or pay — a cancelled invoice from a stale email.
  if (invoice.status === "void") notFound();

  await trackPublicView(
    invoice.status === "sent",
    (meta) => markInvoiceViewed(invoice.id, meta),
    { type: "invoice", id: invoice.id }
  );

  // Snapshots are frozen forever, even across later schema changes — validate
  // the shape rather than casting, so a stale/malformed snapshot 404s cleanly
  // instead of crashing this customer-facing page.
  const snap = parseInvoiceSnapshot(invoice.snapshot);
  if (!snap) notFound();
  // Balance due reflects the live payment ledger, not the frozen snapshot —
  // a partially-paid invoice must not show the full amount as still owed.
  const paid = round2(paymentsPaidTotal(invoice.payments));
  const balanceDue = invoiceOutstanding(invoice);

  // Check whether this org has an active Stripe Connect account so we can
  // surface the Pay now button. We already know the invoice isn't void.
  const orgStripe = await getOrgStripe(invoice.orgId);
  const canPayOnline =
    orgStripe.stripeConnectStatus === "active" &&
    balanceDue > 0 &&
    invoice.status !== "void";

  const payResult: "success" | "cancelled" | null =
    pay === "success" ? "success" : pay === "cancelled" ? "cancelled" : null;
  const sessionId = payResult === "success" && session_id ? session_id : null;

  const view: PublicInvoice = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    dueLabel: snap.dueDate
      ? new Date(snap.dueDate).toLocaleDateString("en-US")
      : null,
    amountFormatted: fmtDollar(invoice.amount),
    paidFormatted: paid > 0 ? fmtDollar(paid) : null,
    balanceDueFormatted: fmtDollar(balanceDue),
    memo: snap.memo,
    terms: snap.terms,
    paymentInstructions: snap.paymentInstructions,
    canPayOnline,
    token,
    payResult,
    sessionId,
    org: {
      name: snap.org.name,
      phone: snap.org.phone,
      address: snap.org.address,
      logo: snap.org.logoUrl,
    },
    customer: snap.customer,
    lines: snap.lines,
  };

  return <PublicInvoiceView invoice={view} />;
}
