import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateIdParams, estimateUpdateSchema } from "@/lib/estimates/schema";
import {
  deleteEstimate,
  estimateHasApprovalToken,
  getEstimate,
  saveEstimate,
} from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  const estimate = await getEstimate(id, orgId);
  if (!estimate) throw new NotFoundError();
  const hasApprovalToken = await estimateHasApprovalToken(id, orgId);
  return { ...estimate, hasApprovalToken };
});

export const PATCH = apiRoute(
  { minRole: "lead", input: estimateUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = estimateIdParams.parse(params);
    const estimate = await saveEstimate(id, orgId, input);
    if (!estimate) throw new NotFoundError();
    const hasApprovalToken = await estimateHasApprovalToken(id, orgId);
    return { ...estimate, hasApprovalToken };
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = estimateIdParams.parse(params);
    await deleteEstimate(id, orgId);
    return null;
  }
);
