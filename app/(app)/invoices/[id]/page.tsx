import { notFound } from "next/navigation";
import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";
import { getInvoice } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoicePage({ params }: Props) {
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();

  const orgId = await getOrgId();
  const invoice = await getInvoice(invoiceId, orgId);
  if (!invoice) notFound();

  return (
    <InvoiceDetail invoiceId={invoiceId} estimateId={invoice.estimateId} />
  );
}
