import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { quoteIdParams } from "@/lib/quotes/schema";
import { rotateApprovalToken } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = quoteIdParams.parse(params);
  const token = await rotateApprovalToken(id, orgId);
  if (!token) throw new NotFoundError();
  return { approvalToken: token };
});
