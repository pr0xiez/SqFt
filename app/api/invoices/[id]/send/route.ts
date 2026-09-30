import { after } from "next/server";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoiceSendSchema } from "@/lib/invoices/schema";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import { requireSender } from "@/lib/send/sender";
import { sendInvoice } from "@/lib/send/sendInvoice";

export const POST = apiRoute(
  { minRole: "lead", input: invoiceSendSchema },
  async ({ orgId, input, params }) => {
    const sender = await requireSender();
    const { id } = invoiceIdParams.parse(params);
    await sendInvoice(id, orgId, { ...input, sender });
    after(() => runQboSyncForOrg(orgId));
    return { ok: true };
  }
);
