import { EstimateLockedError } from "@/lib/api/errors";
import {
  type SendEstimateEmailInput,
  sendEstimateEmail,
} from "@/lib/email/sendEstimateEmail";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { prisma } from "@/lib/prisma";
import {
  getEstimateForSend,
  markEstimateSent,
  rotateApprovalToken,
  writeEstimateEvent,
} from "@/lib/repositories";
import type { EstimateForSend } from "@/lib/repositories/estimateRepo";
import { runSendPipeline, type Sendable, type SendRequest } from "./pipeline";

export type EstimateSendRequest = SendRequest & { message?: string };

const estimateSendable: Sendable<
  EstimateForSend,
  SendEstimateEmailInput,
  EstimateSendRequest
> = {
  load: getEstimateForSend,

  guard(estimate) {
    if (estimate.status === "approved" || estimate.status === "declined") {
      throw new EstimateLockedError(estimate.status);
    }
  },

  currentToken: (estimate) => estimate.approvalToken,
  rotateToken: rotateApprovalToken,

  onTokenRotated: (id, req) =>
    writeEstimateEvent({
      estimateId: id,
      type: "link_rotated",
      actorEmail: req.sender.email,
      actorName: req.sender.name,
    }),

  publicPath: (token) => `/estimate-review/${token}`,

  async prepare(estimate, publicUrl, req) {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: estimate.orgId },
      select: { name: true, phone: true, logo: true },
    });
    // The emailed total is the live Estimate View — single source of truth.
    const total =
      estimate.lineItems.length === 0
        ? 0
        : computeEstimateView(fromPrismaEstimate(estimate)).total;
    return {
      to: req.to,
      subject: req.subject,
      message: req.message,
      publicUrl,
      customerName: estimate.siteMeasure.location.customer?.name ?? "there",
      org,
      estimateNumber: estimate.estimateNumber,
      totalDollars: total,
      replyTo: req.sender.email,
    };
  },

  sendEmail: sendEstimateEmail,

  markSent: (id, orgId, req) =>
    markEstimateSent(id, orgId, {
      to: req.to,
      subject: req.subject,
      sentByEmail: req.sender.email,
      sentByName: req.sender.name,
    }),

  // Opportunistically keep the customer's email current with where the
  // estimate was actually sent. The pipeline swallows and logs failures.
  async afterSent(estimate, req) {
    const customer = estimate.siteMeasure.location.customer;
    if (!customer || customer.email === req.to) return;
    await prisma.customer.updateMany({
      where: { id: customer.id, orgId: estimate.orgId },
      data: { email: req.to },
    });
  },
};

/** Email the customer their estimate-review link and mark the estimate sent. */
export function sendEstimate(
  id: number,
  orgId: string,
  req: EstimateSendRequest
): Promise<void> {
  return runSendPipeline(estimateSendable, id, orgId, req);
}
