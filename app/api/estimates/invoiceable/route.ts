import { apiRoute } from "@/lib/api/route";
import { listInvoiceableEstimates } from "@/lib/repositories";

/**
 * Quick-invoice candidate search. Given `?q=<customer or #number>`, returns
 * estimates with a remaining balance to bill, plus the org's default deposit
 * pct for seeding the invoice dialog. Empty `q` returns no items.
 */
export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return listInvoiceableEstimates(orgId, q);
});
