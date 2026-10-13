import { computeEstimateView } from "./compute";
import { fromPrismaEstimate, type PrismaEstimateForView } from "./fromPrisma";
import type { EstimateView } from "./types";

/**
 * Hydrated Prisma estimate -> computed view. The one seam between Prisma
 * hydration and the estimate math; use `viewFromPrisma(e).total` for the
 * common total-only case.
 */
export function viewFromPrisma(estimate: PrismaEstimateForView): EstimateView {
  return computeEstimateView(fromPrismaEstimate(estimate));
}
