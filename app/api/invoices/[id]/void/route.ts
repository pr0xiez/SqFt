import { after } from "next/server";
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams } from "@/lib/invoices/schema";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import { voidInvoice } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await voidInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  after(() => runQboSyncForOrg(orgId));
  return invoice;
});
