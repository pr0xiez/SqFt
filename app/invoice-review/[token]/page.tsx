import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  type PublicInvoice,
  PublicInvoiceView,
} from "@/components/invoices/PublicInvoiceView";
import { round2 } from "@/lib/money";
import { getInvoiceByToken, markInvoiceViewed } from "@/lib/repositories";
import { fmtDollar } from "@/lib/utils";

export const metadata = {
  title: "Invoice — SqFt",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

type SnapshotShape = {
  memo: string | null;
  terms: string;
  paymentInstructions: string;
  stripePaymentLinkUrl: string | null;
  dueDate: string | null;
  org: {
    name: string;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
  };
  customer: { name: string | null; address: string | null } | null;
  lines: Array<{ name: string; description: string | null; amount: number }>;
};

export default async function PublicInvoicePage({ params }: Props) {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 128) notFound();

  const invoice = await getInvoiceByToken(token);
  if (!invoice || !invoice.snapshot) notFound();

  if (invoice.status === "sent") {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;
    void markInvoiceViewed(invoice.id, { ip, userAgent });
  }

  const snap = invoice.snapshot as unknown as SnapshotShape;
  // Balance due reflects the live payment ledger, not the frozen snapshot —
  // a partially-paid invoice must not show the full amount as still owed.
  const paid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
  const balanceDue = round2(invoice.amount - paid);
  // The Pay button targets the live-balance pay route only when the org can
  // charge and a balance is actually owed (the route re-checks both).
  const canPay =
    invoice.org.stripeChargesEnabled &&
    balanceDue > 0 &&
    invoice.status !== "paid" &&
    invoice.status !== "void";
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
    payUrl: canPay ? `/api/invoice-review/${token}/pay` : null,
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
