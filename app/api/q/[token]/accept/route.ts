import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import {
  estimateAcceptSchema,
  estimateTokenParams,
} from "@/lib/estimates/schema";
import { fromPrismaEstimate } from "@/lib/estimateView";
import {
  canonicalize,
  sha256,
  snapshotEstimate,
} from "@/lib/estimateView/snapshot";
import { acceptEstimateByToken, getEstimateByToken } from "@/lib/repositories";

const MAX_SIG_BYTES = 100 * 1024;

export const POST = publicRoute(
  { input: estimateAcceptSchema },
  async ({ req, input, params }) => {
    const { token } = estimateTokenParams.parse(params);
    const { name, email, signatureDataUrl, consentText } = input;

    // Decoded length check (base64 → bytes ≈ length × 3/4)
    const b64 = signatureDataUrl.slice("data:image/png;base64,".length);
    if ((b64.length * 3) / 4 > MAX_SIG_BYTES) {
      throw new ValidationError("Signature image too large (>100KB)");
    }

    const estimate = await getEstimateByToken(token);
    if (!estimate) throw new NotFoundError();
    if (estimate.status === "accepted" || estimate.status === "declined") {
      throw new ConflictError(`Estimate already ${estimate.status}`);
    }

    const snap = snapshotEstimate(fromPrismaEstimate(estimate), {
      estimateNumber: estimate.estimateNumber,
      date: estimate.date,
      customer: estimate.siteMeasure.customer
        ? {
            name: estimate.siteMeasure.customer.name,
            address: estimate.siteMeasure.customer.address,
            email: estimate.siteMeasure.customer.email,
            phone: estimate.siteMeasure.customer.phone,
          }
        : null,
      org: estimate.org,
    });
    const snapshotHash = sha256(canonicalize(snap));

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const result = await acceptEstimateByToken({
      estimateId: estimate.id,
      signedByName: name,
      signedByEmail: email,
      signatureData: signatureDataUrl,
      consentText,
      estimateSnapshot: snap as never,
      snapshotHash,
      signedIp: ip,
      signedUserAgent: userAgent,
    });

    if (result === "not_found") throw new NotFoundError();
    if (result === "already_signed" || result === "declined") {
      throw new ConflictError(
        `Estimate already ${result === "already_signed" ? "accepted" : "declined"}`
      );
    }

    return { ok: true };
  }
);
