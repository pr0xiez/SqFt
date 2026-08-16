import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoiceUpdateSchema } from "@/lib/invoices/schema";
import {
  getInvoice,
  invoiceHasPublicToken,
  updateInvoice,
} from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await getInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  const hasPublicToken = await invoiceHasPublicToken(id, orgId);
  return { ...invoice, hasPublicToken };
});

export const PATCH = apiRoute(
  { minRole: "lead", input: invoiceUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = invoiceIdParams.parse(params);
    const invoice = await updateInvoice(id, orgId, input);
    if (!invoice) throw new NotFoundError();
    const hasPublicToken = await invoiceHasPublicToken(id, orgId);
    return { ...invoice, hasPublicToken };
  }
);
