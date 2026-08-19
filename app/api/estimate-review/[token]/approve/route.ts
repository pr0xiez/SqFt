import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { estimateTokenParams } from "@/lib/estimates/schema";
import { fromPrismaEstimate } from "@/lib/estimateView";
import { snapshotEstimate } from "@/lib/estimateView/snapshot";
import { approveEstimateByToken, getEstimateByToken } from "@/lib/repositories";
import { getClientIp } from "@/lib/request";

export const POST = publicRoute({}, async ({ req, params }) => {
  const { token } = estimateTokenParams.parse(params);
  const estimate = await getEstimateByToken(token);
  if (!estimate) throw new NotFoundError();
  if (estimate.status === "approved" || estimate.status === "declined") {
    throw new ConflictError(`Estimate already ${estimate.status}`);
  }

  const snap = snapshotEstimate(fromPrismaEstimate(estimate), {
    estimateNumber: estimate.estimateNumber,
    date: estimate.date,
    customer: estimate.siteMeasure.location.customer
      ? {
          name: estimate.siteMeasure.location.customer.name,
          address: estimate.siteMeasure.location.address,
          email: estimate.siteMeasure.location.customer.email,
          phone: estimate.siteMeasure.location.customer.phone,
        }
      : null,
    org: estimate.org,
  });

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const result = await approveEstimateByToken({
    estimateId: estimate.id,
    ip,
    userAgent,
    snapshot: snap as never,
  });
  if (result === "not_found") throw new NotFoundError();
  if (result === "already_approved" || result === "declined") {
    throw new ConflictError(
      `Estimate already ${result === "already_approved" ? "approved" : "declined"}`
    );
  }
  return { ok: true };
});
