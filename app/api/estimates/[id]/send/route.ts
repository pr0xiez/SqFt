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
    if (estimate.status === "accepted" || estimate.status === "declined") {
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

    const publicUrl = `${getPublicBaseUrl()}/q/${token}`;
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
      customerName: estimate.siteMeasure.customer?.name ?? "there",
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

    if (
      estimate.siteMeasure.customer &&
      estimate.siteMeasure.customer.email !== to
    ) {
      void updateCustomerEmail(estimate.siteMeasure.customer.id, orgId, to);
    }

    return { ok: true };
  }
);

async function getOrgForEmail(orgId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, phone: true, logo: true },
  });
}

async function updateCustomerEmail(
  customerId: number,
  orgId: string,
  email: string
) {
  try {
    await prisma.customer.updateMany({
      where: { id: customerId, orgId },
      data: { email },
    });
  } catch (err) {
    logError({ errorMessage: "Failed to save customer email", err });
  }
}
