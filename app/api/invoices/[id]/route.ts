import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams } from "@/lib/invoices/schema";
import { getInvoice, invoiceHasPublicToken } from "@/lib/repositories";
import { getInvoiceQboState } from "@/lib/repositories/qboRepo";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await getInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  const hasPublicToken = await invoiceHasPublicToken(id, orgId);
  const qboSync = await getInvoiceQboState(orgId, id);
  return { ...invoice, hasPublicToken, qboSync };
});
