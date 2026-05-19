import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateIdParams, estimateUpdateSchema } from "@/lib/estimates/schema";
import { deleteEstimate, getEstimate, saveEstimate } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  const estimate = await getEstimate(id, orgId);
  if (!estimate) throw new NotFoundError();
  return estimate;
});

export const PATCH = apiRoute(
  { input: estimateUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = estimateIdParams.parse(params);
    const estimate = await saveEstimate(id, orgId, input);
    if (!estimate) throw new NotFoundError();
    return estimate;
  }
);

export const DELETE = apiRoute(async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  await deleteEstimate(id, orgId);
  return null;
});
