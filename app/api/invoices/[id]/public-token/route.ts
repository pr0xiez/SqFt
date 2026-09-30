import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams } from "@/lib/invoices/schema";
import { getOrCreateInvoicePublicToken } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const token = await getOrCreateInvoicePublicToken(id, orgId);
  if (!token) throw new NotFoundError();
  return { publicToken: token };
});
