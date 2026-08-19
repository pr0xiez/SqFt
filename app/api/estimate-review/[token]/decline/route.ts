import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import {
  estimateDeclineSchema,
  estimateTokenParams,
} from "@/lib/estimates/schema";
import { declineEstimateByToken, getEstimateByToken } from "@/lib/repositories";
import { getClientIp } from "@/lib/request";

export const POST = publicRoute(
  { input: estimateDeclineSchema },
  async ({ req, input, params }) => {
    const { token } = estimateTokenParams.parse(params);

    const estimate = await getEstimateByToken(token);
    if (!estimate) throw new NotFoundError();
    if (estimate.status === "approved" || estimate.status === "declined") {
      throw new ConflictError(`Estimate already ${estimate.status}`);
    }

    const clientIp = getClientIp(req.headers);
    const ip = clientIp === "unknown" ? null : clientIp;
    const userAgent = req.headers.get("user-agent") ?? null;

    const result = await declineEstimateByToken(estimate.id, {
      reason: input.reason ?? null,
      ip,
      userAgent,
    });
    if (result === "not_found") throw new NotFoundError();
    if (result !== "ok") {
      throw new ConflictError(
        `Estimate already ${result.replace("already_", "")}`
      );
    }

    return { ok: true };
  }
);
