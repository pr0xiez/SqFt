import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateIdParams } from "@/lib/estimates/schema";
import { invoiceCreateSchema } from "@/lib/invoices/schema";
import { createInvoice, listInvoicesForEstimate } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  return listInvoicesForEstimate(id, orgId);
});

export const POST = apiRoute(
  { minRole: "lead", input: invoiceCreateSchema, status: 201 },
  async ({ orgId, input, params }) => {
    const { id } = estimateIdParams.parse(params);
    const invoice = await createInvoice(orgId, {
      estimateId: id,
      amount: input.amount,
      pct: input.pct,
      memo: input.memo,
      terms: input.terms,
      coverNote: input.coverNote,
      dueDate: input.dueDate,
    });
    if (!invoice) throw new NotFoundError();
    return invoice;
  }
);
