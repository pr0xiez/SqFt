import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateCreateSchema } from "@/lib/estimates/schema";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { createEstimate, listEstimates } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) => {
  const estimates = await listEstimates(orgId);
  return estimates.map((estimate) => {
    const { lineItems: _lineItems, siteMeasure, ...rest } = estimate;
    const { items: _items, ...estimateRest } = siteMeasure;
    const view = computeEstimateView(fromPrismaEstimate(estimate));
    return {
      ...rest,
      siteMeasure: estimateRest,
      total: estimate._count.lineItems === 0 ? null : view.total,
    };
  });
});

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const estimate = await createEstimate(orgId, input);
    if (!estimate) throw new NotFoundError("Site measure not found");
    return estimate;
  }
);
