import {
  ConflictError,
  EmailFailedError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { sendEstimateEmail } from "@/lib/email/sendEstimateEmail";
import { estimateIdParams, estimateSendSchema } from "@/lib/estimates/schema";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getEstimate,
  markEstimateSent,
  rotateApprovalToken,
  updateCustomerEmail,
  writeEstimateEvent,
} from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const POST = apiRoute(
  { minRole: "lead", input: estimateSendSchema },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const sender = session.user;
    if (!sender?.email || !sender?.name) throw new UnauthorizedError();

    const { id: estimateId } = estimateIdParams.parse(params);
    const { to, subject, message, regenerateLink } = input;

    const estimate = await getEstimate(estimateId, orgId);
    if (!estimate) throw new NotFoundError();
    if (estimate.status === "approved" || estimate.status === "declined") {
      throw new ConflictError(`Cannot re-send a ${estimate.status} estimate`);
    }

    let token = estimate.approvalToken;
    if (regenerateLink || !token) {
      token = await rotateApprovalToken(estimateId, orgId);
      if (!token) throw new NotFoundError();
      await writeEstimateEvent({
        estimateId,
        type: "link_rotated",
        actorEmail: sender.email,
        actorName: sender.name,
      });
    }

    const publicUrl = `${getPublicBaseUrl()}/estimate-review/${token}`;
    const total =
      estimate.lineItems.length === 0
        ? 0
        : computeEstimateView(fromPrismaEstimate(estimate)).total;
    const org = await getOrgForEmail(orgId);

    const sendResult = await sendEstimateEmail({
      to,
      subject,
      message,
      publicUrl,
      customerName: estimate.siteMeasure.location.customer?.name ?? "there",
      org: { name: org.name, phone: org.phone, logo: org.logo },
      estimateNumber: estimate.estimateNumber,
      totalDollars: total,
      replyTo: sender.email,
    });

    if (!sendResult.ok) {
      throw new EmailFailedError(sendResult.error ?? "Email failed");
    }

    const marked = await markEstimateSent(estimateId, orgId, {
      to,
      subject,
      sentByEmail: sender.email,
      sentByName: sender.name,
    });
    if (!marked) throw new NotFoundError();

    // Opportunistically persist the edited recipient address back onto the
    // customer. This is best-effort: the estimate has already been sent and
    // marked sent, so a failure here must NOT fail the request — but we must
    // also not pretend it succeeded (see #175). Surface the outcome to the
    // client via `customerEmailSaved` so the UI can warn the user.
    const sendCustomer = estimate.siteMeasure.location.customer;
    let customerEmailSaved = true;
    if (sendCustomer && sendCustomer.email !== to) {
      try {
        customerEmailSaved = await updateCustomerEmail(
          sendCustomer.id,
          orgId,
          to
        );
      } catch (err) {
        logError({ errorMessage: "Failed to save customer email", err });
        customerEmailSaved = false;
      }
    }

    return { ok: true, customerEmailSaved };
  }
);

async function getOrgForEmail(orgId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, phone: true, logo: true },
  });
}
