import { apiRoute } from "@/lib/api/route";
import { estimateIdParams, estimateSendSchema } from "@/lib/estimates/schema";
import { sendEstimate } from "@/lib/send/sendEstimate";
import { requireSender } from "@/lib/send/sender";

export const POST = apiRoute(
  { minRole: "lead", input: estimateSendSchema },
  async ({ orgId, input, params }) => {
    const sender = await requireSender();
    const { id } = estimateIdParams.parse(params);
    const { afterSentOk } = await sendEstimate(id, orgId, { ...input, sender });
    // The send itself succeeded (a failure would have thrown). `afterSentOk`
    // reports the best-effort customer-email save: surface it so the UI can
    // warn when the email didn't persist, instead of it failing silently.
    return { ok: true, customerEmailSaved: afterSentOk };
  }
);
