import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoiceSendSchema } from "@/lib/invoices/schema";
import { requireSender } from "@/lib/send/sender";
import { sendInvoice } from "@/lib/send/sendInvoice";

export const POST = apiRoute(
  { minRole: "lead", input: invoiceSendSchema },
  async ({ orgId, input, params }) => {
    const sender = await requireSender();
    const { id } = invoiceIdParams.parse(params);
    await sendInvoice(id, orgId, { ...input, sender });
    return { ok: true };
  }
);
