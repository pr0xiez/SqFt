import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { isEstimateLocked } from "@/lib/estimateStatus";
import { estimateIdParams } from "@/lib/estimates/schema";
import { getEstimate, reviseEstimate } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);

  const original = await getEstimate(id, orgId);
  if (!original) throw new NotFoundError();
  if (!isEstimateLocked(original.status)) {
    throw new ConflictError(
      "Only approved or declined estimates can be revised"
    );
  }

  const result = await reviseEstimate(id, orgId);
  if (!result) throw new NotFoundError();
  return { ok: true, id: result.id };
});
