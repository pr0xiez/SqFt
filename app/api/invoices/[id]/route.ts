import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoiceUpdateSchema } from "@/lib/invoices/schema";
import { getInvoice, updateInvoice } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await getInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  return invoice;
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
