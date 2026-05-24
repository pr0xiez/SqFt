import { apiRoute } from "@/lib/api/route";
import { estimateCreateSchema } from "@/lib/estimates/schema";
import { createEstimate, listEstimates } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  listEstimates(orgId)
);

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => createEstimate(orgId, input)
);
