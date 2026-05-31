import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateIdParams } from "@/lib/estimates/schema";
import { rotateApprovalToken } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  const token = await rotateApprovalToken(id, orgId);
  if (!token) throw new NotFoundError();
  return { approvalToken: token };
});
