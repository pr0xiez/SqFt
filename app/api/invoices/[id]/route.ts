import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoiceUpdateSchema } from "@/lib/invoices/schema";
import { getInvoice, updateInvoice } from "@/lib/repositories";
import { getInvoiceQboState } from "@/lib/repositories/qboRepo";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await getInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  // null when the org has no QBO connection (the badge stays hidden).
  const qboSync = await getInvoiceQboState(orgId, id);
  return { ...invoice, qboSync };
});

export const PATCH = apiRoute(
  { minRole: "lead", input: invoiceUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = invoiceIdParams.parse(params);
    const invoice = await updateInvoice(id, orgId, input);
    if (!invoice) throw new NotFoundError();
    return invoice;
  }
);
