import type { InvoiceStatusFilter } from "@/components/invoices/filterInvoices";
import { apiRoute } from "@/lib/api/route";
import { parsePageParams } from "@/lib/pagination/params";
import { type InvoiceSortKey, listInvoices } from "@/lib/repositories";

const INVOICE_SORT_KEYS = [
  "number",
  "customer",
  "amount",
  "dueDate",
  "sentAt",
] as const satisfies readonly InvoiceSortKey[];

const INVOICE_STATUS_FILTERS = [
  "all",
  "open",
  "draft",
  "paid",
  "void",
] as const satisfies readonly InvoiceStatusFilter[];

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: INVOICE_SORT_KEYS,
    defaultSort: { key: "sentAt", direction: "desc" },
  });
  const statusParam = req.nextUrl.searchParams.get("status");
  const status: InvoiceStatusFilter =
    statusParam &&
    (INVOICE_STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as InvoiceStatusFilter)
      : "all";

  return listInvoices(orgId, { page, perPage, sort, q, status });
});
