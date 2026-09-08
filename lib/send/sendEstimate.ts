import { EstimateLockedError } from "@/lib/api/errors";
import {
  type SendEstimateEmailInput,
  sendEstimateEmail,
} from "@/lib/email/sendEstimateEmail";
import { isEstimateLocked } from "@/lib/estimateStatus";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getEstimateForSend,
  markEstimateSent,
  rotateApprovalToken,
  updateCustomerEmail,
  writeEstimateEvent,
} from "@/lib/repositories";
import type { EstimateForSend } from "@/lib/repositories/estimateRepo";
import { runSendPipeline, type Sendable, type SendRequest } from "./pipeline";

export type EstimateSendRequest = SendRequest & { message?: string };

/** Builds a fresh Sendable per call so `customerEmailSaved` isn't shared
 *  mutable state across concurrent sends. */
function buildEstimateSendable(customerEmailResult: {
  saved: boolean;
}): Sendable<EstimateForSend, SendEstimateEmailInput, EstimateSendRequest> {
  return {
    load: getEstimateForSend,

    guard(estimate) {
      if (isEstimateLocked(estimate.status)) {
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
    // send itself, but it's surfaced to the caller via customerEmailResult
    // instead of only living in the logs.
    async afterSent(estimate, req) {
      const customer = estimate.siteMeasure.location.customer;
      if (!customer || customer.email === req.to) return;
      try {
        const saved = await updateCustomerEmail(
          customer.id,
          estimate.orgId,
          req.to
        );
        if (!saved) customerEmailResult.saved = false;
      } catch (err) {
        logError({ errorMessage: "Failed to save customer email", err });
        customerEmailResult.saved = false;
      }
    },
  };
}

export interface SendEstimateResult {
  customerEmailSaved: boolean;
}

/** Email the customer their estimate-review link and mark the estimate sent. */
export async function sendEstimate(
  id: number,
  orgId: string,
  req: EstimateSendRequest
): Promise<SendEstimateResult> {
  const customerEmailResult = { saved: true };
  await runSendPipeline(
    buildEstimateSendable(customerEmailResult),
    id,
    orgId,
    req
  );
  return { customerEmailSaved: customerEmailResult.saved };
}
