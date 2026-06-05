import { NotFoundError, UnauthorizedError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoicePaymentSchema } from "@/lib/invoices/schema";
import { recordPayment } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const POST = apiRoute(
  { minRole: "lead", input: invoicePaymentSchema, status: 201 },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const u = session.user;
    if (!u?.email || !u?.name) throw new UnauthorizedError();
    const { id } = invoiceIdParams.parse(params);
    const invoice = await recordPayment(id, orgId, {
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      reference: input.reference,
      note: input.note,
      recordedByEmail: u.email,
      recordedByName: u.name,
    });
    if (!invoice) throw new NotFoundError();
    return invoice;
  },
);
