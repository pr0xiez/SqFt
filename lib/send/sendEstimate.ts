import { EstimateLockedError } from "@/lib/api/errors";
import {
  type SendEstimateEmailInput,
  sendEstimateEmail,
} from "@/lib/email/sendEstimateEmail";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { prisma } from "@/lib/prisma";
import {
  getEstimate,
  markEstimateSent,
  rotateApprovalToken,
  updateCustomerEmail,
  writeEstimateEvent,
} from "@/lib/repositories";
import type { EstimateWithDetails } from "@/lib/repositories/estimateRepo";
import {
  runSendPipeline,
  type Sendable,
  type SendRequest,
  type SendResult,
} from "./pipeline";

export type EstimateSendRequest = SendRequest & { message?: string };

const estimateSendable: Sendable<
  EstimateWithDetails,
  SendEstimateEmailInput,
  EstimateSendRequest
> = {
  load: getEstimate,

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
  // estimate was actually sent. Best-effort: a failure here never fails the
  // send (the email already went out), but the pipeline reports it back as
  // `afterSentOk: false` so the route can tell the client the email wasn't
  // saved instead of swallowing it silently.
  async afterSent(estimate, req) {
    const customer = estimate.siteMeasure.location.customer;
    if (!customer || customer.email === req.to) return;
    await updateCustomerEmail(customer.id, estimate.orgId, req.to);
  },
};

/** Email the customer their estimate-review link and mark the estimate sent. */
export function sendEstimate(
  id: number,
  orgId: string,
  req: EstimateSendRequest
): Promise<SendResult> {
  return runSendPipeline(estimateSendable, id, orgId, req);
}
